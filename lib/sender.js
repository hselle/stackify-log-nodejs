// Copyright (c) 2024 BMC Software, Inc.
// Copyright (c) 2021-2024 Netreo
// Copyright (c) 2019 Stackify

/* ### function sender (options, data, [cb], [fail])
###### @options {Object} request options (hostname, headers, path, post data etc).
###### @cb {Function} **Optional** callback function to be executed if request was succesful
###### @fail {Function} **Optional** function to be executed if request wasn't succesful
Low level function for sending http/https requests
*/
var util         = require('util'),
    axios        = require('axios'),
    urlModule    = require('url'),
    requestSync  = require('sync-request'),
    debug        = require('./debug'),
    event       = require('./event'),
    CONFIG       = require('../config/config.js');

var sender = module.exports = {};

function axiosRequest(options, callback) {
    var axiosConfig = {
        method: options.method || 'POST',
        url: options.url,
        headers: options.headers,
        data: options.body
    };

    if (options.proxy) {
        var parsed = urlModule.parse(options.proxy);
        axiosConfig.proxy = {
            protocol: (parsed.protocol || 'http:').replace(':', ''),
            host: parsed.hostname,
            port: parseInt(parsed.port, 10) || 80
        };
    }

    axios(axiosConfig)
        .then(function(response) {
            callback(null, { statusCode: response.status, body: response.data }, response.data);
        })
        .catch(function(err) {
            if (err.response) {
                callback(null, { statusCode: err.response.status, body: err.response.data }, err.response.data);
            } else {
                callback(err);
            }
        });
}

module.exports.request = axiosRequest;
module.exports.requestSync = requestSync;

module.exports.send = function send(options, cb, fail) {

    var callback = function (error, response, body) {
        if (!error) {
            debug.writeResponse(response);
            if (response.statusCode === 200) {
                if (cb) {
                    return cb({success: true, appData: response.body});
                }
            } else {
                if (fail) {
                    fail(response.statusCode);
                }
            }
        } else {
            debug.write('Request failed: ', util.inspect(error.stack));
            debug.write('Request failed details: ', JSON.stringify(error));
            event.emit(CONFIG.EVENT_ERROR, 'error', error.message, [{error: error}]);
        }
    };

    sender.request(options, callback);
    debug.writeRequest(options);
};

module.exports.sendSync = function sendSync(options) {
    try {
        var res = sender.requestSync('POST', options.url, {
            json: options.data,
            headers: options.headers
        });
        options.data.Msgs = options.data.Msgs.length + ' messages';
        debug.close('Sending logs synchronously before exiting the app: ' + JSON.stringify(options));
    } catch (err) {
        debug.writeSync('Sending failed. Error stack: ' + JSON.stringify(err.stack));
        process.exit(1);
    }
};
