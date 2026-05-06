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
    childProcess = require('child_process'),
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

// Spawns a child Node.js process to make a synchronous (blocking) POST request.
// Uses stdin to pass config, avoiding any shell injection risk.
function nativeSyncPost(requestUrl, body, headers) {
    var parsed = urlModule.parse(requestUrl);
    var isHttps = parsed.protocol === 'https:';
    var bodyStr = JSON.stringify(body);
    var allHeaders = Object.assign({}, headers, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
    });

    var config = JSON.stringify({
        isHttps: isHttps,
        hostname: parsed.hostname,
        port: parseInt(parsed.port, 10) || (isHttps ? 443 : 80),
        path: parsed.path || '/',
        headers: allHeaders,
        body: bodyStr
    });

    var script = [
        'process.stdin.resume();',
        'var d="";',
        'process.stdin.on("data",function(c){d+=c;});',
        'process.stdin.on("end",function(){',
        '  var c=JSON.parse(d);',
        '  var m=require(c.isHttps?"https":"http");',
        '  var r=m.request({hostname:c.hostname,port:c.port,path:c.path,method:"POST",headers:c.headers});',
        '  r.on("error",function(){process.exit(0);});',
        '  r.on("response",function(){process.exit(0);});',
        '  r.write(c.body);r.end();',
        '});'
    ].join('');

    childProcess.spawnSync(process.execPath, ['-e', script], {
        input: config,
        timeout: 10000
    });
}

module.exports.request = axiosRequest;
module.exports.requestSync = nativeSyncPost;

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
        sender.requestSync(options.url, options.data, options.headers);
        options.data.Msgs = options.data.Msgs.length + ' messages';
        debug.close('Sending logs synchronously before exiting the app: ' + JSON.stringify(options));
    } catch (err) {
        debug.writeSync('Sending failed. Error stack: ' + JSON.stringify(err.stack));
        process.exit(1);
    }
};
