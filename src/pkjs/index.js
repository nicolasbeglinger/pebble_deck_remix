// Import the Clay package
var Clay = require("pebble-clay");
// Load our Clay configuration file
var clayConfig = require("./config.json");
var customClay = require("./custom-clay");
// Initialize Clay, with its events handled below so its message to the watch can be cleaned up
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });
var keys = require("message_keys");

// Console lines in each density.
var CONSOLE_SLOTS = { high: 10, low: 8 };
// Plugin readings fill the slots from COMP_PLUGIN1 up, and get the 13 columns after the prefix.
var FIRST_PLUGIN_COMP = 14;
var PLUGIN_SLOTS = 5;
var PLUGIN_TEXT_COLUMNS = 13;
var PLUGIN_SEND_DELAY_MS = 250;
var PLUGIN_RETRY_DELAY_MS = 2000;
var PLUGIN_SEND_RETRIES = 3;

var preferredSubscription = null;
var readingSubscriptions = [];
var pluginLines = {}; // What each plugin slot should say
var sentPluginLines = {}; // What the watch has acknowledged
var pluginSendBusy = false;
var pluginSendFailures = 0;

// Default regex to extract data from the API response.
// First capture group is sent to the watch (max 12 chars).
var defaultApiRegex = /"summary"\s*:\s*"?([^"]+)"?/;

// Convert an Open-Meteo (WMO) weather code to a condition string.
// The watch line has 13 columns after "[MET] >> " and the temperature can take 5
// ("-12C "), so plain words are kept to 8 characters and METAR codes to 4.
function weatherCodeToCondition(code, useMetar) {
  if (!useMetar) {
    if (code === 0) return "CLEAR";
    if (code <= 3) return "CLOUDY";
    if (code <= 48) return "FOG";
    if (code <= 55) return "DRIZZLE";
    if (code <= 57) return "FRZ DRZL";
    if (code <= 65) return "RAIN";
    if (code <= 67) return "FRZ RAIN";
    if (code <= 77) return "SNOW";
    if (code <= 82) return "SHOWERS";
    if (code <= 86) return "SNOW";
    if (code <= 99) return "T-STORM";
    return "UNKNOWN";
  }
  if (code === 0) return "CLR";
  if (code === 1) return "FEW";
  if (code === 2) return "SCT";
  if (code === 3) return "OVC";
  if (code === 45) return "FG";
  if (code === 48) return "FZFG";
  if (code <= 55) return "DZ";
  if (code <= 57) return "FZDZ";
  if (code <= 65) return "RA";
  if (code <= 67) return "FZRA";
  if (code <= 75) return "SN";
  if (code === 77) return "SG";
  if (code <= 82) return "SHRA";
  if (code <= 86) return "SHSN";
  if (code === 95) return "TS";
  if (code <= 99) return "TSGR";
  return "UNK";
}

// Helper function for XMLHttpRequest with optional auth header
function xhrRequest(url, type, authHeader, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    callback(this.status, this.responseText);
  };
  xhr.onerror = function () {
    callback(0, null);
  };
  xhr.open(type, url);
  if (authHeader) {
    xhr.setRequestHeader("Authorization", authHeader);
  }
  xhr.send();
}

// Load custom API config from Clay settings stored in localStorage
function loadApiConfig() {
  var config = {
    endpointUrl: "",
    regex: defaultApiRegex,
    auth: "",
    useFahrenheit: false,
    useMetar: false,
  };
  try {
    var raw = localStorage.getItem("clay-settings");
    if (raw) {
      var claySettings = JSON.parse(raw);
      if (claySettings.CustomApiUrl) {
        config.endpointUrl = claySettings.CustomApiUrl;
      }
      if (claySettings.CustomApiRegex) {
        try {
          config.regex = new RegExp(claySettings.CustomApiRegex);
        } catch (_) {}
      }
      if (claySettings.CustomApiAuth) {
        config.auth = claySettings.CustomApiAuth;
      }
      if (claySettings.TemperatureUnit) {
        config.useFahrenheit = claySettings.TemperatureUnit;
      }
      if (claySettings.MetarWeather) {
        config.useMetar = claySettings.MetarWeather;
      }
    }
  } catch (e) {
    console.error(e);
  }
  return config;
}

// Parse custom API response body with regex, then JSON fallback, then raw text
function parseCustomApiResponse(body, regex) {
  var match = regex.exec(body);
  if (match && match[1]) {
    return match[1].toString().toUpperCase().substring(0, 12);
  }
  try {
    var res = JSON.parse(body);
    var value = res.text || res.summary || res.status || res.value;
    return (
      String(value || "")
        .toUpperCase()
        .substring(0, 12) || "NO DATA"
    );
  } catch (_) {
    return body.toString().toUpperCase().substring(0, 12);
  }
}

// Fetch custom API endpoint and then send everything to the watch
function fetchCustomApi(conditions, altitude, apiConfig) {
  if (
    !apiConfig.endpointUrl ||
    apiConfig.endpointUrl.indexOf("https://") !== 0
  ) {
    sendToWatch(conditions, altitude, "API ERR");
    return;
  }

  xhrRequest(
    apiConfig.endpointUrl,
    "GET",
    apiConfig.auth,
    function (status, responseText) {
      var customApiString;

      if (status >= 200 && status < 300 && responseText) {
        try {
          customApiString = parseCustomApiResponse(
            responseText,
            apiConfig.regex
          );
        } catch (e) {
          console.error(e);
        }
      } else {
        customApiString = "API OFFLINE";
      }

      sendToWatch(conditions, altitude, customApiString);
    }
  );
}

// Send telemetry data to the Pebble watch
function sendToWatch(conditions, altitude, customApiString) {
  var dictionary = {};
  dictionary["Conditions"] = conditions;
  dictionary["Alt"] = altitude;
  dictionary["CustomApi"] = customApiString;

  Pebble.sendAppMessage(
    dictionary,
    function () {
      console.log("Telemetry payload sent to Pebble successfully!");
    },
    function () {
      console.log("Error sending telemetry payload to Pebble!");
    }
  );
}

// Fetch weather from Open-Meteo, then fetch custom API, then send to watch
function updateData() {
  var config = loadApiConfig();

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      var altitude = (pos.coords.altitude || 0) * 3.281;

      var url =
        "https://api.open-meteo.com/v1/forecast?" +
        "latitude=" +
        pos.coords.latitude +
        "&longitude=" +
        pos.coords.longitude +
        "&current=temperature_2m,weather_code";

      xhrRequest(url, "GET", null, function (status, responseText) {
        // A leading "!" tells the watch this is a failure, not a reading: it keeps
        // showing the last good one (with its age) instead of replacing it.
        var conditions = "!OFFLINE";

        if (status === 200 && responseText) {
          try {
            var json = JSON.parse(responseText);

            var temp_value = Math.round(json.current.temperature_2m);

            if (config.useFahrenheit) {
              temp_value = Math.round((temp_value * 9) / 5 + 32);
            }

            conditions =
              temp_value +
              (config.useFahrenheit ? "F " : "C ") +
              weatherCodeToCondition(json.current.weather_code, config.useMetar);
          } catch (e) {
            console.error(e);
          }
        }

        fetchCustomApi(conditions, altitude, config);
      });
    },
    function (err) {
      console.log("Error requesting location!");
      fetchCustomApi("!NO GPS", 0, config);
    },
    {
      timeout: 15000,
      maximumAge: 60000,
    }
  );
}

// The plugin slots the layout uses, so nothing unused gets read or asks for permission.
function activePluginSlots() {
  var slots = [];
  try {
    var claySettings = JSON.parse(localStorage.getItem("clay-settings")) || {};
    var count = CONSOLE_SLOTS[claySettings.Density] || CONSOLE_SLOTS.high;
    for (var i = 1; i <= count; i++) {
      var slot = parseInt(claySettings["ActiveSlots" + i], 10) - FIRST_PLUGIN_COMP;
      if (slot >= 0 && slot < PLUGIN_SLOTS && slots.indexOf(slot) === -1) {
        slots.push(slot);
      }
    }
  } catch (e) {
    console.error(e);
  }
  return slots;
}

// ASCII only: the watch's fixed buffers count one byte per column, and the face already
// writes "12C" rather than "12°C". Normalising first keeps the E of an É.
function consoleText(text) {
  return String(text)
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^\x20-\x7E]/g, "");
}

function twoDigits(number) {
  return (number < 10 ? "0" : "") + number;
}

// A reading offers whichever shapes its plugin can make, so take the richest that fits.
function pluginReadingText(reading) {
  if (!reading) return "";
  var longText = reading.longText ? consoleText(reading.longText.text) : "";
  var shortText = reading.shortText ? consoleText(reading.shortText.text) : "";
  var text = "";

  if (longText && (longText.length <= PLUGIN_TEXT_COLUMNS || !shortText)) {
    text = longText;
  } else if (shortText) {
    text = shortText;
  } else if (reading.numericValue) {
    var value = Math.round(reading.numericValue.value * 10) / 10;
    text = consoleText(value + (reading.numericValue.unit || ""));
  } else if (reading.boolean) {
    text = reading.boolean.value ? "ON" : "OFF";
  } else if (reading.timestamp) {
    var at = new Date(reading.timestamp.value * 1000);
    text = twoDigits(at.getHours()) + ":" + twoDigits(at.getMinutes());
  }
  return text.substring(0, PLUGIN_TEXT_COLUMNS);
}

function pluginTag(property) {
  var tag = property.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (tag + "   ").substring(0, 3);
}

function pluginLine(tag, text) {
  return "[" + tag + "] >> " + text;
}

function setPluginLine(slot, line) {
  pluginLines[slot] = line;
  if (line !== sentPluginLines[slot]) schedulePluginSend(PLUGIN_SEND_DELAY_MS);
}

// One send for everything that changed: readings tend to arrive in a bunch and the watch can
// only take one message at a time, and an unchanged refresh shouldn't wake its radio at all.
function schedulePluginSend(delayMs) {
  if (pluginSendBusy) return;
  pluginSendBusy = true;
  setTimeout(sendPluginLines, delayMs);
}

function sendPluginLines() {
  var dictionary = {};
  var sending = {};
  Object.keys(pluginLines).forEach(function (slot) {
    if (pluginLines[slot] !== sentPluginLines[slot]) {
      sending[slot] = pluginLines[slot];
      dictionary[keys.Plugin + Number(slot)] = pluginLines[slot];
    }
  });

  if (!Object.keys(sending).length) {
    pluginSendBusy = false;
    return;
  }

  Pebble.sendAppMessage(
    dictionary,
    function () {
      Object.keys(sending).forEach(function (slot) {
        sentPluginLines[slot] = sending[slot];
      });
      pluginSendFailures = 0;
      pluginSendBusy = false;
      schedulePluginSend(PLUGIN_SEND_DELAY_MS); // Anything that changed mid-flight
    },
    function () {
      console.log("Error sending plugin lines to Pebble!");
      pluginSendBusy = false;
      // Past the limit, the slot's next change or refresh tries again.
      if (++pluginSendFailures <= PLUGIN_SEND_RETRIES) {
        schedulePluginSend(PLUGIN_RETRY_DELAY_MS);
      }
    }
  );
}

function subscribePluginReading(slot, reading) {
  var tag = pluginTag(reading.property);

  readingSubscriptions.push(
    Pebble.subscribeToSource({
      category: reading.category,
      item: reading.item,
      properties: [reading.property],
      onData: function (envelope) {
        var instance = envelope.instances[reading.index];
        var text = pluginReadingText(
          instance && instance.properties[reading.property]
        );
        setPluginLine(slot, pluginLine(tag, text || "NO DATA"));
      },
      onError: function (err) {
        console.log(reading.category + "/" + reading.item + ": " + err.code);
        // A subscription survives errors, so like the weather, keep the last good reading.
        if (err.code === "PERMISSION_DENIED") {
          setPluginLine(slot, pluginLine(tag, "NEEDS PERM"));
        } else if (!pluginLines[slot]) {
          setPluginLine(slot, pluginLine(tag, "NO DATA"));
        }
      },
    })
  );
}

function stopPluginReadings() {
  readingSubscriptions.forEach(function (subscription) {
    subscription.unsubscribe();
  });
  readingSubscriptions = [];
}

function shortTextOf(properties, name) {
  return properties[name] && properties[name].shortText
    ? properties[name].shortText.text
    : "";
}

function onPreferredReadings(envelope) {
  var readings = envelope.instances.map(function (instance) {
    var p = instance.properties;
    return {
      category: shortTextOf(p, "category"),
      item: shortTextOf(p, "item"),
      property: shortTextOf(p, "property"),
      index: p.index && p.index.numericValue ? p.index.numericValue.value : 0,
    };
  });

  stopPluginReadings();
  activePluginSlots().forEach(function (slot) {
    if (readings[slot]) {
      subscribePluginReading(slot, readings[slot]);
    } else {
      setPluginLine(slot, pluginLine("PL" + (slot + 1), "NOT SET"));
    }
  });
}

function showNoPlugins(slots) {
  slots.forEach(function (slot) {
    setPluginLine(slot, pluginLine("PL" + (slot + 1), "NO PLUGINS"));
  });
}

// Plugins are a preview the phone app ships with switched off. Each slot shows one of the
// readings the user picked under Settings > Plugins > Complications.
function startPlugins() {
  if (preferredSubscription) preferredSubscription.unsubscribe();
  preferredSubscription = null;
  stopPluginReadings();

  var slots = activePluginSlots();
  if (!slots.length) return;

  if (!Pebble.subscribeToSource) {
    showNoPlugins(slots);
    return;
  }

  preferredSubscription = Pebble.subscribeToSource({
    category: "preferences",
    item: "complications",
    onData: onPreferredReadings,
    onError: function (err) {
      console.log("preferences/complications: " + err.code);
      // Anything but "unavailable" could be a hiccup, and the readings on screen are still good.
      showNoPlugins(
        slots.filter(function (slot) {
          return err.code === "PLUGIN_UNAVAILABLE" || !pluginLines[slot];
        })
      );
    },
  });
}

// The phone-only settings (the custom API and weather units) have no message key, so Clay's
// dictionary collapses them into a NaN key, and a host that checks keys rejects the whole send.
function sendSettingsToWatch(response) {
  var settings = clay.getSettings(response);
  delete settings.NaN;

  Pebble.sendAppMessage(
    settings,
    function () {
      console.log("Settings sent to Pebble successfully!");
    },
    function () {
      console.log("Error sending settings to Pebble!");
    }
  );
}

Pebble.addEventListener("showConfiguration", function () {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener("ready", function () {
  console.log("Pebble ready, initializing app updates.");
  updateData();
  startPlugins();
});

Pebble.addEventListener("webviewclosed", function (e) {
  if (e && e.response) {
    console.log("Settings closed. Fetching fresh data with new configs...");
    sendSettingsToWatch(e.response);
    updateData();
    startPlugins();
  }
});

Pebble.addEventListener("appmessage", function (e) {
  if (e.payload["RequestWeather"]) {
    updateData();
  }
});
