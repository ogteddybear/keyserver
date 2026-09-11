/**
 * Copyright (C) 2020 Mailvelope GmbH
 * Licensed under the GNU Affero General Public License version 3
 */

'use strict';

const Boom = require('@hapi/boom');
const util = require('../lib/util');

/**
 * The REST api to provide additional functionality on top of HKP
 */
class REST {
  /**
   * Create an instance of the REST server
   * @param  {Object} publicKey   An instance of the public key service
   * @param  {Object} userId      An instance of the user id service
   */
  constructor(publicKey, baseUrl) {
    this._publicKey = publicKey;
    this._baseUrl = baseUrl;
    // simple in-memory cache for stats to reduce DB load
    this._statsCache = { value: null, expires: 0, ttl: 30 * 1000 };
  }

  /**
   * Public key / user ID upload via http POST
   * @param {Object} request - hapi request object
   * @param {Object} h - hapi response toolkit
   */
  async create(request, h) {
    const {emails, publicKeyArmored} = request.payload;
    if (!publicKeyArmored) {
      return Boom.badRequest('No public armored key found');
    }
    const origin = util.origin(this._baseUrl);
    await this._publicKey.put({emails, publicKeyArmored, origin, i18n: request.i18n});
    return h.response('Upload successful. Check your inbox to verify your email address.').code(200);
  }

  /**
   * Public key query via http GET
   * @param {Object} request - hapi request object
   * @param {Object} h - hapi response toolkit
   */
  async query(request, h) {
    const {op} = request.query;
    if (op === 'verify') {
      return this.verify(request, h);
    } else if (op === 'verifyRemove') {
      return this.verifyRemove(request, h);
    }
    // do READ if no 'op' provided
    const {keyId, fingerprint, email} = request.query;
    if (!keyId && !fingerprint && ! email ||
        keyId && !util.isKeyId(keyId) || fingerprint && !util.isFingerPrint(fingerprint) || email && !util.isEmail(email)) {
      return Boom.badRequest('Missing parameter: keyId, fingerprint or email.');
    }
    return h.response(await this._publicKey.get({keyId, fingerprint, email, i18n: request.i18n}));
  }

  /**
   * Verify a public key's user id via http GET
   * @param {Object} request - hapi request object
   * @param {Object} h - hapi response toolkit
   */
  async verify(request, h) {
    const {keyId, nonce} = request.query;
    if (!util.isKeyId(keyId) || !util.isNonce(nonce)) {
      throw Boom.badRequest('Invalid parameter keyId or nonce');
    }
    const {email} = await this._publicKey.verify({keyId, nonce});
    // create link for sharing
    const link = util.url(util.origin(this._baseUrl), `/pks/lookup?op=get&search=${email}`);
    return h.view('verify-success', {email, link});
  }

  /**
   * Request public key removal via http DELETE
   * @param {Object} request - hapi request object
   * @param {Object} h - hapi response toolkit
   */
  async remove(request, h) {
    const {keyId, email} = request.query;
    const origin  = util.origin(this._baseUrl);
    if (!util.isKeyId(keyId) && !util.isEmail(email)) {
      throw Boom.badRequest('Invalid parameter keyId or email');
    }
    await this._publicKey.requestRemove({keyId, email, origin, i18n: request.i18n});
    return h.response('Check your inbox to verify the removal of your email address.').code(200);
  }

  /**
   * Verify public key removal via http GET
   * @param {Object} request - hapi request object
   * @param {Object} h - hapi response toolkit
   */
  async verifyRemove(request, h) {
    const {keyId, nonce} = request.query;
    if (!util.isKeyId(keyId) || !util.isNonce(nonce)) {
      throw Boom.badRequest('Invalid parameter keyId or nonce');
    }
    const {email} = await this._publicKey.verifyRemove({keyId, nonce});
    return h.view('removal-success', {email});
  }

  /**
   * Service status endpoint
   * Returns basic service information (uptime, baseUrl, timestamp)
   */
  async status(request, h) {
    const uptime = process.uptime();
    const now = new Date().toISOString();
    return h.response({
      ok: true,
      service: 'keyserver',
      baseUrl: this._baseUrl,
      uptime_seconds: Math.floor(uptime),
      now
    }).code(200).type('application/json');
  }

  /**
   * Statistics endpoint using MongoDB aggregation and simple in-memory caching
   */
  async stats(request, h) {
    const nowMs = Date.now();
    if (this._statsCache.value && this._statsCache.expires > nowMs) {
      return h.response(this._statsCache.value).code(200).type('application/json');
    }

    const mongo = this._publicKey._mongo;
    if (!mongo) {
      return Boom.badImplementation('Database module unavailable');
    }

    try {
      // total keys: count documents
      const totalKeys = await mongo.count({}, 'publickey');
      // keysWithVerified: documents with at least one verified user id
      const keysWithVerified = await mongo.count({'userIds.verified': true}, 'publickey');

      // aggregate to get totalUserIds and totalVerifiedUserIds efficiently
      const pipeline = [
        { $unwind: { path: '$userIds', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: null,
          totalUserIds: { $sum: { $cond: [ { $ifNull: ['$userIds', false] }, 1, 0 ] } },
          totalVerifiedUserIds: { $sum: { $cond: [ '$userIds.verified', 1, 0 ] } }
        } }
      ];

      const cursor = mongo.aggregate(pipeline, 'publickey');
      const rows = await cursor.toArray();
      const agg = rows && rows[0] ? rows[0] : { totalUserIds: 0, totalVerifiedUserIds: 0 };

      const totalUserIds = agg.totalUserIds || 0;
      const totalVerifiedUserIds = agg.totalVerifiedUserIds || 0;
      const totalUnverifiedUserIds = totalUserIds - totalVerifiedUserIds;

      const payload = {
        ok: true,
        now: new Date().toISOString(),
        stats: {
          totalKeys,
          keysWithVerified,
          totalUserIds,
          totalVerifiedUserIds,
          totalUnverifiedUserIds
        }
      };

      // cache result
      this._statsCache.value = payload;
      this._statsCache.expires = Date.now() + this._statsCache.ttl;

      return h.response(payload).code(200).type('application/json');
    } catch (e) {
      return Boom.badImplementation('Failed to compute stats');
    }
  }
}

exports.plugin = {
  name: 'REST',
  async register(server, options) {
    const rest = new REST(server.app.publicKey, options.server.baseUrl);

    const routeOptions = {
      bind: rest,
      cors: options.server.cors,
      security: options.server.security,
      ext: {
        onPreResponse: {
          method({response}, h) {
            if (!response.isBoom) {
              return h.continue;
            }
            return h.response(response.message).code(response.output.statusCode).type('text/plain');
          }
        }
      }
    };

    server.route({
      method: 'POST',
      path: '/api/v1/key',
      handler: rest.create,
      options: routeOptions
    });

    server.route({
      method: 'GET',
      path: '/api/v1/key',
      handler: rest.query,
      options: routeOptions
    });

    server.route({
      method: 'DELETE',
      path: '/api/v1/key',
      handler: rest.remove,
      options: routeOptions
    });

    // New endpoints: status and stats
    server.route({
      method: 'GET',
      path: '/api/v1/status',
      handler: rest.status,
      options: routeOptions
    });

    server.route({
      method: 'GET',
      path: '/api/v1/stats',
      handler: rest.stats,
      options: routeOptions
    });
  }
};
