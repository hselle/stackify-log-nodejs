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
    got          = require('got'),
    requestSync  = require('sync-request'),
    debug        = require('./debug'),
    event       = require('./event'),
    CONFIG       = require('../config/config.js');

var sender = module.exports = {};

module.exports.got = got;
module.exports.requestSync = requestSync;

module.exports.send = function send(options, cb, fail) {

    sender.got(options.url, {
        method: 'POST',
        json: options.body,
        headers: options.headers,
        responseType: 'json'
    }).then(function(response) {
        debug.writeResponse(response);
        if (response.statusCode === 200){
            if (cb) {
                cb({success: true, appData: response.body});
            }
        } 
    }).catch(function(error) {
        if (error.response) {
            debug.writeResponse(error.response);
            if (fail){
                fail(error.response.statusCode);
            } 
        } else {
            debug.write('Request failed: ', util.inspect(error.stack));
            debug.write('Request failed details: ', JSON.stringify(err));
            event.emit(CONFIG.EVENT_ERROR, 'error', error.message, [{error: err}]);
        }
    });

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
