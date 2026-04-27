/* global pipwerks */

(function() {
  'use strict';
  var startTimeStamp, scormUnload, actions, student;

  function formatSuspendData(data) {
    var dataArray = data.split(',');
    var newString = '';
    var indexString = '';
    for (var i = 0; i < dataArray.length; i++) {
      indexString = String('000' + i).slice(-3);
      newString += indexString + ',' + dataArray[i] + ',';
    }
    newString = newString.substring(0, newString.length - 1);
    return newString;
  }

  // Left-pads intNum to intNumDigits, using zeroes.
  function zeroPad(intNum, intNumDigits) {
    var strTemp, intLen, i;

    strTemp = '' + intNum;
    intLen = strTemp.length;

    if (intLen > intNumDigits) {
      return strTemp.substr(0, intNumDigits);
    } else {
      for (i = intLen; i < intNumDigits; i++) {
        strTemp = '0' + strTemp;
      }
    }

    return strTemp;
  }

  // SCORM requires time to be formatted in a specific way. This
  // function bludgeons a sensible time-in-milliseconds into SCORM's format.
  // The second parameter indicates whether fractional components of the time
  // are to be included in the result.
  function convertMillisecondsToSCORMTime(intTotalMilliseconds, blnIncludeFraction = true) {
    var intHours, intMinutes, intSeconds, intMilliseconds, intHundredths, strCMITimeSpan;

    intMilliseconds = intTotalMilliseconds % 1000;
    intSeconds = ((intTotalMilliseconds - intMilliseconds) / 1000) % 60;
    intMinutes = ((intTotalMilliseconds - intMilliseconds - (intSeconds * 1000)) / 60000) % 60;
    intHours = (intTotalMilliseconds - intMilliseconds - (intSeconds * 1000) - (intMinutes * 60000)) / 3600000;

    if (intHours === 10000) intHours = 9999;

    intMinutes = (intTotalMilliseconds - (intHours * 3600000)) / 60000;
    if (intMinutes === 100) intMinutes = 99;
    intMinutes = Math.floor(intMinutes);

    intSeconds = (intTotalMilliseconds - (intHours * 3600000) - (intMinutes * 60000)) / 1000;
    if (intSeconds === 100) intSeconds = 99;
    intSeconds = Math[blnIncludeFraction ? 'floor' : 'round'](intSeconds);

    intMilliseconds = (intTotalMilliseconds - (intHours * 3600000) - (intMinutes * 60000) - (intSeconds * 1000));

    intHundredths = Math.round(intMilliseconds / 10);
    if (intHundredths >= 100) {
      intSeconds++;
      intHundredths %= 100;
    }

    strCMITimeSpan = zeroPad(intHours, 4) + ':' + zeroPad(intMinutes, 2) + ':' + zeroPad(intSeconds, 2);

    if (blnIncludeFraction) strCMITimeSpan += '.' + intHundredths;

    if (intHours > 9999) {
      strCMITimeSpan = '9999:99:99';
      if (blnIncludeFraction) strCMITimeSpan += '.99';
    }

    return strCMITimeSpan;
  }

  function convertMillisecondsToISODuration(milliseconds) {
    let seconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);

    seconds %= 60;
    minutes %= 60;
    hours %= 24;

    let duration = `P`;
    if (days > 0) duration += `${days}D`;
    if (hours > 0 || minutes > 0 || seconds > 0) duration += `T`;
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (seconds > 0) duration += `${seconds}S`;

    return duration;
  }

  startTimeStamp = new Date();
  scormUnload = function() {
    var version = pipwerks.SCORM.version;

    var endTimeStamp = new Date();
    var sessionTimeMs = (endTimeStamp.getTime() - startTimeStamp.getTime());

    if (version === '2004') {
      pipwerks.SCORM.set('cmi.session_time', convertMillisecondsToISODuration(sessionTimeMs));
    } else {
      pipwerks.SCORM.set('cmi.core.session_time', convertMillisecondsToSCORMTime(sessionTimeMs, false));
    }
    pipwerks.SCORM.save();
    pipwerks.SCORM.quit();

    scormUnload = () => {};
  };

  function updateScore(scorePercent) {
    var version = pipwerks.SCORM.version;
    var scorePercent = Number(scorePercent) || 0;
    pipwerks.SCORM.set(version === '2004' ? 'cmi.score.min' : 'cmi.core.score.min', '0');
    pipwerks.SCORM.save();
    pipwerks.SCORM.set(version === '2004' ? 'cmi.score.max' : 'cmi.core.score.max', '100');
    pipwerks.SCORM.save();
    pipwerks.SCORM.set(version === '2004' ? 'cmi.score.raw' : 'cmi.core.score.raw', String(scorePercent));
    pipwerks.SCORM.save();
    if (version === '2004') {
      pipwerks.SCORM.set('cmi.score.scaled', String(scorePercent / 100));
      pipwerks.SCORM.save();
    }
  }

  window.onbeforeunload = scormUnload;

  actions = {
    terminate: function() {
      scormUnload();
    },
    giveMeProgress: function(msg, e) {
      var suspendData;
      suspendData = pipwerks.SCORM.get('cmi.suspend_data');
      e.source.postMessage(suspendData, e.origin);
    },
    sendingticks: function(msg) {
      var version = pipwerks.SCORM.version;
      pipwerks.SCORM.set('cmi.suspend_data', formatSuspendData(msg.data));
      pipwerks.SCORM.save();
      if (version === '2004') {
        pipwerks.SCORM.set('cmi.progress_measure', msg.progress_percent / 100);
        pipwerks.SCORM.save();
      }
      updateScore(msg.check);
    },
    unitComplete: function(msg) {
      var completeSuccess;
      var version = pipwerks.SCORM.version;
      pipwerks.SCORM.set('cmi.suspend_data', formatSuspendData(msg.data));
      pipwerks.SCORM.save();

      if (version === '2004') {
        pipwerks.SCORM.set('cmi.progress_measure', 1);
        pipwerks.SCORM.save();
      }
      completeSuccess = pipwerks.SCORM.set(version === '2004' ? 'cmi.completion_status' : 'cmi.core.lesson_status', 'completed');
      pipwerks.SCORM.save();

      updateScore(msg.check);

      if (completeSuccess) return;
      pipwerks.SCORM.init();
      actions.unitComplete(msg);
    },
    getInfo: function(msg, e) {
      var info = {};
      var version = pipwerks.SCORM.version;
      info['entry'] = pipwerks.SCORM.get(version === '2004' ? 'cmi.entry' : 'cmi.core.entry');
      info['lesson_mode'] = pipwerks.SCORM.get('cmi.core.lesson_mode');
      info['suspend_data'] = pipwerks.SCORM.get('cmi.suspend_data');
      info['completion_status'] = pipwerks.SCORM.get(version === '2004' ? 'cmi.completion_status' : 'cmi.core.lesson_status');
      info['total_time'] = pipwerks.SCORM.get('cmi.core.total_time');
      info['max_time_allowed'] = pipwerks.SCORM.get('cmi.core.max_time_allowed');
      e.source.postMessage(info, e.origin);
    }
  };

  function listener(event) {
    var message;
    try {
      message = JSON.parse(event.data);
    } catch {
    }
    if (message && message.action && message.action in actions) return actions[message.action](message, event);
  }

  if (window.addEventListener) {
    window.addEventListener('message', listener, false);
  } else {
    window.attachEvent('onmessage', listener);
  }

  if (pipwerks.SCORM.init()) {
    if (!document.getElementById('form')) return;
    student = {
      id: pipwerks.SCORM.get(pipwerks.SCORM.version === '2004' ? 'cmi.learner_id' : 'cmi.core.student_id'),
      name: pipwerks.SCORM.get(pipwerks.SCORM.version === '2004' ? 'cmi.learner_name' : 'cmi.core.student_name')
    };

    document.getElementById('studentId').value = student.id;
    document.getElementById('studentName').value = student.name;
    document.getElementById('form').submit();
  }
})();
