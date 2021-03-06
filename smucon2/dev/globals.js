// globals.js

var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isFirefox = typeof window.InstallTrigger !== 'undefined';
var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
var isChrome = !!window.chrome && !isOpera;
var isIE = !!document.documentMode;

var isPluginRTC = isSafari || isIE;

var isMobileDevice = !!navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i);

// detect node-webkit
var isNodeWebkit = !!(window.process && (typeof window.process === 'object') && window.process.versions && window.process.versions['node-webkit']);


var chromeVersion = 50;
var matchArray = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
if (isChrome && matchArray && matchArray[2]) {
    chromeVersion = parseInt(matchArray[2], 10);
}

var firefoxVersion = 50;
matchArray = navigator.userAgent.match(/Firefox\/(.*)/);
if (isFirefox && matchArray && matchArray[1]) {
    firefoxVersion = parseInt(matchArray[1], 10);
}

function fireEvent(obj, eventName, args) {
    if (typeof CustomEvent === 'undefined') {
        return;
    }

    var eventDetail = {
        arguments: args,
        __exposedProps__: args
    };

    var event = new CustomEvent(eventName, eventDetail);
    obj.dispatchEvent(event);
}

function setHarkEvents(connection, streamEvent) {
    if (!connection || !streamEvent) {
        throw 'Both arguments are required.';
    }

    if (!connection.onspeaking || !connection.onsilence) {
        return;
    }

    if (typeof hark === 'undefined') {
        throw 'hark.js not found.';
    }

    hark(streamEvent.stream, {
        onspeaking: function() {
            connection.onspeaking(streamEvent);
        },
        onsilence: function() {
            connection.onsilence(streamEvent);
        },
        onvolumechange: function(volume, threshold) {
            if (!connection.onvolumechange) {
                return;
            }
            connection.onvolumechange(merge({
                volume: volume,
                threshold: threshold
            }, streamEvent));
        }
    });
}

function setMuteHandlers(connection, streamEvent) {
    streamEvent.stream.addEventListener('mute', function(event) {
        event = connection.streamEvents[event.target.streamid];

        event.session = {
            audio: event.muteType === 'audio',
            video: event.muteType === 'video'
        };

        connection.onmute(event);
    }, false);

    streamEvent.stream.addEventListener('unmute', function(event) {
        event = connection.streamEvents[event.target.streamid];

        event.session = {
            audio: event.unmuteType === 'audio',
            video: event.unmuteType === 'video'
        };

        connection.onunmute(event);
    }, false);
}

function getRandomString() {
    if (window.crypto && window.crypto.getRandomValues && navigator.userAgent.indexOf('Safari') === -1) {
        var a = window.crypto.getRandomValues(new Uint32Array(3)),
            token = '';
        for (var i = 0, l = a.length; i < l; i++) {
            token += a[i].toString(36);
        }
        return token;
    } else {
        return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
    }
}

// Get HTMLAudioElement/HTMLVideoElement accordingly

function getRMCMediaElement(stream, callback, connection) {
    var isAudioOnly = false;
    if (!stream.getVideoTracks().length) {
        isAudioOnly = true;
    }

    var mediaElement = document.createElement(isAudioOnly ? 'audio' : 'video');

    if (isPluginRTC) {
        connection.videosContainer.insertBefore(mediaElement, connection.videosContainer.firstChild);

        setTimeout(function() {
            Plugin.attachMediaStream(mediaElement, stream);
            callback(mediaElement);
        }, 1000);

        return;
    }

    // "mozSrcObject" is always preferred over "src"!!
    mediaElement[isFirefox ? 'mozSrcObject' : 'src'] = isFirefox ? stream : window.URL.createObjectURL(stream);
    mediaElement.controls = true;

    // http://goo.gl/WZ5nFl
    // Firefox don't yet support onended for any stream (remote/local)
    if (isFirefox) {
        mediaElement.addEventListener('ended', function() {
            // fireEvent(stream, 'ended', stream);
            currentUserMediaRequest.remove(stream.idInstance);

            if (stream.type === 'local') {
                StreamsHandler.onSyncNeeded(stream.streamid, 'ended');

                connection.attachStreams.forEach(function(aStream, idx) {
                    if (stream.streamid === aStream.streamid) {
                        delete connection.attachStreams[idx];
                    }
                });

                var newStreamsArray = [];
                connection.attachStreams.forEach(function(aStream) {
                    if (aStream) {
                        newStreamsArray.push(aStream);
                    }
                });
                connection.attachStreams = newStreamsArray;
                connection.observers.all();

                var streamEvent = connection.streamEvents[stream.streamid];

                if (streamEvent) {
                    connection.onstreamended(streamEvent);
                    return;
                }
                if (this.parentNode) {
                    this.parentNode.removeChild(this);
                }
            }
        }, false);
    }

    mediaElement.play();
    callback(mediaElement);
}

// if IE
if (!window.addEventListener) {
    window.addEventListener = function(el, eventName, eventHandler) {
        if (!el.attachEvent) {
            return;
        }
        el.attachEvent('on' + eventName, eventHandler);
    };
}

function listenEventHandler(eventName, eventHandler) {
    window.removeEventListener(eventName, eventHandler);
    window.addEventListener(eventName, eventHandler, false);
}

window.attachEventListener = function(video, type, listener, useCapture) {
    video.addEventListener(type, listener, useCapture);
};

function removeNullEntries(array) {
    var newArray = [];
    array.forEach(function(item) {
        if (item) {
            newArray.push(item);
        }
    });
    return newArray;
}


function isData(session) {
    return !session.audio && !session.video && !session.screen && session.data;
}

function isNull(obj) {
    return typeof obj === 'undefined';
}

function isString(obj) {
    return typeof obj === 'string';
}

var MediaStream = window.MediaStream;

if (typeof MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
    MediaStream = webkitMediaStream;
}

/*global MediaStream:true */
if (typeof MediaStream !== 'undefined' && !('stop' in MediaStream.prototype)) {
    MediaStream.prototype.stop = function() {
        if (!this.getAudioTracks && !!this.getTracks) {
            this.getAudioTracks = function() {
                var array = [];
                this.getTracks.forEach(function(track) {
                    if (track.kind.toString().indexOf('audio') !== -1) {
                        array.push(track);
                    }
                });
                return array;
            };
        }

        if (!this.getVideoTracks && !!this.getTracks) {
            this.getVideoTracks = function() {
                var array = [];
                this.getTracks.forEach(function(track) {
                    if (track.kind.toString().indexOf('video') !== -1) {
                        array.push(track);
                    }
                });
                return array;
            };
        }

        this.getAudioTracks().forEach(function(track) {
            if (!!track.stop) {
                track.stop();
            }
        });

        this.getVideoTracks().forEach(function(track) {
            if (!!track.stop) {
                track.stop();
            }
        });

        if (isFirefox) {
            fireEvent(this, 'ended');
        }
    };
}

if (typeof MediaStream !== 'undefined') {
    // MediaStream.getTracks() maybe?
    if (!('getAudioTracks' in MediaStream.prototype) || typeof MediaStream.prototype.getAudioTracks !== 'function') {
        MediaStream.prototype.getAudioTracks = function() {}
    }

    if (!('getVideoTracks' in MediaStream.prototype) || typeof MediaStream.prototype.getVideoTracks !== 'function') {
        MediaStream.prototype.getVideoTracks = function() {}
    }
}

var lastChanges = '';

function observeObject(obj, callback) {
    if (!Object.observe) return;
    if (isMobileDevice) return;

    Object.observe(obj, function(changes) {
        var jsonStringified = JSON.stringify(changes);
        if (lastChanges == jsonStringified) return;
        lastChanges = jsonStringified;
        callback(changes);
    });
}
