/**
 * Copyright (C) 2020 Mailvelope GmbH
 * Licensed under the GNU Affero General Public License version 3
 */

'use strict';

exports.plugin = {
  name: 'www',
  async register(server, options) {
    const routeOptions = {
      security: options.server.security
    };

    server.route({
      method: 'GET',
      path: '/',
      handler: {
        view: 'index'
      },
      options: routeOptions
    });

    server.route({
      method: 'GET',
      path: '/index.html',
      handler(request, h) {
        return h.redirect('/').permanent();
      },
      options: routeOptions
    });

    server.route({
      method: 'GET',
      path: '/manage.html',
      handler: {
        view: 'manage'
      },
      options: routeOptions
    });

    // Render the upload page using the configured layout.
    // The template file should be placed at src/view/views/upload.html
    // and is referenced here as 'views/upload' because server.views() points
    // at src/view as the base directory for templates.
    server.route({
      method: 'GET',
      path: '/upload.html',
      handler: {
        view: 'views/upload'
      },
      options: routeOptions
    });
  }
};
