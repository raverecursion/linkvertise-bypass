if (typeof browser !== "undefined") {
  chrome = browser;
}

var _logCache = [];
var mouseMoved = Date.now();
const intermediateBody = `
<body id='myjd-intermediate-captcha' style='margin: 0; padding: 32px; width: 100%; height: 100%; background: #3c686f; color: #ffffff;'>

function clearDocument() {
  try {
    let htmls = document.getElementsByTagName("html");
    let children = htmls[0].childNodes;

    for (let i = 0; i < children.length; i++) {
      var parentElement = children[i];
      while (parentElement.childElementCount > 0) {
        parentElement.removeChild(parentElement.lastChild);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function ResultPoll(job) {
  let self = this;

  function _poll() {
    let sTokenElement = document.getElementById("g-recaptcha-response");
    let fallbackElement = document.getElementById("captcha-response");
    if (
      sTokenElement != null &&
      sTokenElement.value != null &&
      sTokenElement.value.length > 0
    ) {
      _logCache.push(
        Date.now() + " | result poll SUCCESSFULL, value: " + sTokenElement.value
      );
      self.cancel();
      CaptchaFormInjector.success(sTokenElement.value, job);
    } else if (
      fallbackElement != null &&
      fallbackElement.value != null &&
      fallbackElement.value.length > 0
    ) {
      _logCache.push(
        Date.now() +
          " | result poll SUCCESSFULL (FALLBACK ELEMENT), value: " +
          fallbackElement.value
      );
      self.cancel();
      CaptchaFormInjector.success(fallbackElement.value, job);
    }
  }

  this.poll = function (interval) {
    _logCache.push(Date.now() + " | starting result poll");
    this.intervalHandle = setInterval(_poll, interval || 500);
  };

  this.cancel = function () {
    if (self.intervalHandle !== undefined) {
      clearInterval(self.intervalHandle);
    }
  };
}

let CaptchaFormInjector = (function () {
  let tabMode = document.location.hash.startsWith("#rc2jdt");
  let state = {
    inserted: false,
  };

  function loadSolverTemplate(callback, errorCallback, templateUrl) {
    let xhr = new XMLHttpRequest();
    xhr.onload = function () {
      _logCache.push(Date.now() + " | solver template loaded");
      if (callback !== undefined && typeof callback === "function") {
        try {
          callback(this.response);
        } catch (error) {
          errorCallback(error);
        }
      }
    };
    xhr.onerror = function () {
      _logCache.push(Date.now() + " | failed to load solver template");
      if (error !== undefined && typeof error === "function") {
        errorCallback(this.response);
      }
    };
    xhr.open(
      "GET",
      templateUrl === undefined
        ? chrome.runtime.getURL("./res/browser_solver_template.html")
        : templateUrl
    );
    xhr.responseType = "text";
    xhr.send();
  }

  let sendLoadedEvent = function (element, callbackUrl) {
    let bounds = element.getBoundingClientRect();

    let w = Math.max(
      document.documentElement.clientWidth,
      window.innerWidth || 0
    );
    let h = Math.max(
      document.documentElement.clientHeight,
      window.innerHeight || 0
    );
    /*
     * If the browser does not support screenX and screen Y, use screenLeft and
     * screenTop instead (and vice versa)
     */
    let winLeft = window.screenX ? window.screenX : window.screenLeft;
    let winTop = window.screenY ? window.screenY : window.screenTop;
    let windowWidth = window.outerWidth;
    let windowHeight = window.outerHeight;
    let ie = getInternetExplorerVersion();
    if (ie > 0) {
      if (ie >= 10) {
        // bug in ie 10 and 11
        let zoom = screen.deviceXDPI / screen.logicalXDPI;
        winLeft *= zoom;
        winTop *= zoom;
        windowWidth *= zoom;
        windowHeight *= zoom;
      }
    }
    let loadedParams = Object.create(null);
    loadedParams.x = winLeft;
    loadedParams.y = winTop;
    loadedParams.w = windowWidth;
    loadedParams.h = windowHeight;
    loadedParams.vw = w;
    loadedParams.vh = h;
    loadedParams.eleft = bounds.left;
    loadedParams.etop = bounds.top;
    loadedParams.ew = bounds.width;
    loadedParams.eh = bounds.height;

    chrome.runtime.sendMessage({
      name: "myjdrc2",
      action: "loaded",
      callbackUrl: callbackUrl,
      params: loadedParams,
    });
    console.warn("LOADED EVENT", loadedParams);
  };

  let sendMouseMovedEvent = function (callbackUrl, currentTime) {
    chrome.runtime.sendMessage({
      name: "myjdrc2",
      action: "mouse-move",
      callbackUrl: callbackUrl,
      timestamp: currentTime,
    });
  };

  let init = function (data) {
    let injectionMsg = { type: "myjdrc2", name: "injected" };
    _logCache.push(
      Date.now() + " | posting to parent " + JSON.stringify(injectionMsg)
    );
    window.parent.postMessage(injectionMsg, "*");
    _logCache.push(Date.now() + " | tab mode inited");
    if (typeof data.params !== "object") {
      data.params = JSON.parse(data.params);
    }
    let params = data.params;
    let v3action = params.v3action;
    let siteKey = params.siteKey;
    let siteKeyType = params.siteKeyType;
    let hoster = params.siteDomain;
    let callbackUrl = data.callbackUrl;
    let captchaId = params.captchaId || callbackUrl.match("\\?id=(.*)")[1];
    _logCache.push(
      Date.now() +
        " | [params] sitekey: " +
        siteKey +
        " callbackUrl: " +
        callbackUrl +
        " captchaId: " +
        captchaId +
        " hoster: " +
        hoster +
        " additional data: " +
        v3action
    );
    writeCaptchaFormFirefoxCompat({
      siteKey: siteKey,
      siteKeyType: siteKeyType,
      callbackUrl: callbackUrl,
      captchaId: captchaId,
      hoster: hoster,
      v3action: v3action,
    });
    chrome.runtime.sendMessage({
      name: "myjdrc2",
      action: "tabmode-init",
      data: {
        callbackUrl: callbackUrl,
        captchaId: captchaId,
      },
    });

    let searchElementTimeout = setTimeout(function () {
      let captchaContainer = document.getElementById("captchaContainer");
      if (captchaContainer != null) {
        clearInterval(searchElementTimeout);
        sendLoadedEvent(captchaContainer, callbackUrl);
      }
    }, 300);

    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg.name && msg.name === "myjdrc2") {
        if (msg.action && msg.action === "captcha-done") {
          if (msg.data && msg.data.captchaId === captchaId) {
            chrome.runtime.sendMessage({
              name: "close-me",
              data: { tabId: "self" },
            });
          }
        }
      }
    });

    if (callbackUrl !== "MYJD") {
      // only check for auto-close conditions if captcha comes from localhost
      document.addEventListener("mousemove", function (event) {
        let currentTime = Date.now();
        if (currentTime - mouseMoved > 3 * 1000) {
          mouseMoved = currentTime;
          sendMouseMovedEvent(callbackUrl, currentTime);
        }
      });
    }
  };

  let i18n = function () {
    const keys = [
      "header_please_solve",
      "help_whats_happening_header",
      "help_whats_happening_description",
      "help_whats_happening_link",
      "help_need_help_header",
      "help_need_help_description",
      "help_need_help_link",
    ];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const element = document.getElementById(key);
      if (element != null) {
        const replace = chrome.i18n.getMessage(key);
        if (replace != null) {
          element.innerText = replace;
        }
      }
    }
  };

  let listenToParent = function () {
    let lastKnownHeight;
    let lastKnownWidth;
    setInterval(function () {
      if (
        document.documentElement &&
        document.documentElement.scrollHeight &&
        document.documentElement.scrollWidth
      ) {
        // Firefox: document.body.scrollHeight not returning correct values if body contains position:fixed elements -> using document.documentElement
        let currentHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        );
        let currentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        );
        if (
          lastKnownHeight !== currentHeight - 32 ||
          lastKnownWidth !== currentWidth - 16
        ) {
          lastKnownHeight = currentHeight;
          lastKnownWidth = currentWidth;
          /*window.parent.postMessage({
            type: "myjdrc2",
            name: "window-dimensions-update",
            data: {height: currentHeight + 32, width: currentWidth + 16}
          }, "*"); */
        }
      }
    }, 500);
  };

  let success = function (result, job) {
    if (result && result.length > 0) {
      sendSolution(result, job);
    }
  };

  let sendSolution = function (token, job) {
    let resultMsg = {
      name: "myjdrc2",
      action: "response",
      data: {
        token: token,
        callbackUrl: job.callbackUrl,
        captchaId: job.captchaId,
      },
    };
    _logCache.push(
      Date.now() +
        " | sending solution message to extension background " +
        JSON.stringify(resultMsg)
    );
    chrome.runtime.sendMessage(resultMsg);

    setTimeout(function () {
      chrome.runtime.sendMessage({
        name: "close-me",
        data: { tabId: "self" },
      });
    }, 2000);
    window.parent.postMessage(
      { type: "myjdrc2", name: "response", data: { token: token } },
      "*"
    );
  };

  let insertHosterName = function (body, hosterName) {
    if (hosterName != null && hosterName != "" && hosterName != "undefined") {
      _logCache.push(
        Date.now() +
          " | inserting hostername into DOM for job " +
          JSON.stringify(hosterName)
      );
      let hosterNameContainer = body.getElementsByClassName("hosterName");
      for (let i = 0; i < hosterNameContainer.length; i++) {
        hosterNameContainer[i].textContent = hosterName.replace(
          /^(https?):\/\//,
          ""
        );
      }
    } else {
      let shouldHideContainer = body.getElementsByClassName("hideIfNoHoster");
      for (let i = 0; i < shouldHideContainer.length; i++) {
        shouldHideContainer[i].style.visibility = "hidden";
      }
    }
  };

  let insertFavIcon = function (body, favicon) {
    if (favicon != null && favicon.startsWith("data:image/png;base64,")) {
      let favIconImg = body.getElementsByClassName("hideIfNoFavicon");
      for (let i = 0; i < favIconImg.length; i++) {
        favIconImg[i].src = favicon;
      }
    } else {
      let favIconImg = body.getElementsByClassName("hideIfNoFavicon");
      for (let i = 0; i < favIconImg.length; i++) {
        favIconImg[i].style.visibility = "hidden";
      }
    }
  };

  let insertRc2ScriptIntoDOM = function (body, job) {
    let nameSpace =
      job.enterprise === true ? "grecaptcha.enterprise" : "grecaptcha";
    _logCache.push(
      Date.now() +
        " | inserting rc2 script into DOM for job " +
        JSON.stringify(job)
    );
    let captchaContainer = body.getElementsByClassName("captchaContainer")[0];
    captchaContainer.innerHTML =
      '<div id="recaptcha_container"><form action="" method="post"> <div class="placeholder"> <div id="recaptcha_widget"> \
                <form action="?" method="POST"> \
                <div id="recaptcha-widget-placeholder" class="g-recaptcha" data-callback="onResponse"></div> \
                </form></div>';
    captchaContainer
      .querySelector(".g-recaptcha")
      .setAttribute("data-sitekey", job.siteKey);
    if (job.siteKeyType === "INVISIBLE") {
      captchaContainer
        .querySelector(".g-recaptcha")
        .setAttribute("data-size", "invisible");
      captchaContainer.innerHTML +=
        "<button style='border: 1px solid #FF9900' class='invisible-captcha-button' id='submit' onclick='onClickCallbackScript();'>" +
        chrome.i18n.getMessage("button_i_am_no_robot") +
        "</button>";
    }
    let dataCallbackScript = document.createElement("script");
    dataCallbackScript.type = "text/javascript";
    dataCallbackScript.text =
      "window.onResponse = function (response) {\n" +
      "            document.getElementById('captcha-response').value = response;\n" +
      "        }";
    body.appendChild(dataCallbackScript);

    let onClickCallbackScript = document.createElement("script");
    onClickCallbackScript.type = "text/javascript";
    if (job.v3action != null && job.v3action !== "") {
      try {
        if (typeof job.v3action === "object") {
          job.v3action = "`" + JSON.stringify(job.v3action) + "`";
        } else if (typeof job.v3action === "string") {
          job.v3action = "`" + job.v3action + "`";
          JSON.parse(job.v3action); // trigger fallback if not parsable
        }
      } catch (error) {
        // fallback: we can't get json out of job.v3action
        job.v3action = "`" + JSON.stringify({ action: "login" }) + "`";
      }

      let callbackScript =
        "window.onClickCallbackScript =   function () {\n" +
        "                " +
        nameSpace +
        ".ready(function () {\n" +
        "                    " +
        nameSpace +
        ".execute(JSON.parse(" +
        job.v3action +
        ")).then(function (token) {\n" +
        "                        var el = document.getElementById('captcha-response');\n" +
        "                        if (el == null) {" +
        "                           el = document.getElementById('g-recaptcha-response');    " +
        "                        }           " +
        "                        el.value = token;\n" +
        "                    });\n" +
        "                });\n" +
        "        };";
      onClickCallbackScript.text = callbackScript;
    } else {
      onClickCallbackScript.text =
        "window.onClickCallbackScript =   function () {\n" +
        "                " +
        nameSpace +
        ".execute();   \n" +
        "        };";
    }
    body.appendChild(onClickCallbackScript);

    var rc2Script = document.createElement("script");
    rc2Script.type = "text/javascript";
    if (job.enterprise === true) {
      rc2Script.src =
        "https://www.google.com/recaptcha/enterprise.js?render=explicit";
    } else {
      rc2Script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    }
    rc2Script.onload = function () {
      var delayedRenderScript = document.createElement("script");
      delayedRenderScript.type = "text/javascript";
      delayedRenderScript.innerText =
        `
                    var handle = setInterval(() => {
                        if (grecaptcha) {
                    ` +
        nameSpace +
        `.render(\"recaptcha-widget-placeholder\");
                    clearInterval(handle);
                        }
                    },100);
                    `;
      body.appendChild(delayedRenderScript);

      console.log(
        Date.now() + " | rc2script onload fired, letting window.parent know"
      );
      window.parent.postMessage(
        { type: "myjdrc2", name: "content_loaded" },
        "*"
      );
    };
    body.appendChild(rc2Script);

    let resultPoll = new ResultPoll(job);
    resultPoll.poll();
  };

  let writeCaptchaFormFirefoxCompat = function (job) {
    _logCache.push(Date.now() + " | firefox compat: tab mode");
    console.log("job", job);
    loadSolverTemplate(
      function (template) {
        clearDocument();

        const descriptionMetaTag = document.createElement("meta");
        descriptionMetaTag.name = "description";
        descriptionMetaTag.content = solverDescription;
        document.head.appendChild(descriptionMetaTag);
        const styleTag = document.createElement("style");
        styleTag.innerText = solverCSS;
        document.head.appendChild(styleTag);
        const titleTag = document.createElement("title");
        titleTag.innerText = solverTitle;
        document.head.appendChild(titleTag);
        const newBody = document.createElement("body");
        newBody.innerHTML = template;
        insertHosterName(newBody, job.hoster);
        insertFavIcon(newBody, job.favIcon);
        insertRc2ScriptIntoDOM(newBody, job);

        document.body = newBody;

        if (job.callbackUrl === "MYJD") {
          var captchaControls = document.getElementById(
            "captchaControlsContainer"
          );
          captchaControls.style = "display:none;";
        }

        i18n();
        insertButtonListeners(job);
      },
      function (xhrError) {
        console.error(xhrError);
      }
    );
  };

  let insertButtonListeners = function (job) {
    document
      .getElementById("captchaSkipHoster")
      .addEventListener("click", function () {
        sendSkipRequest("hoster", job);
      });
    document
      .getElementById("captchaSkipPackage")
      .addEventListener("click", function () {
        sendSkipRequest("package", job);
      });
    document
      .getElementById("captchaSkipAll")
      .addEventListener("click", function () {
        sendSkipRequest("all", job);
      });
    document
      .getElementById("captchaCancel")
      .addEventListener("click", function () {
        sendSkipRequest("single", job);
      });
  };

  function sendSkipRequest(skipType, job) {
    chrome.runtime.sendMessage({
      name: "myjdrc2",
      action: "tabmode-skip-request",
      data: {
        skipType: skipType,
        captchaId: job.captchaId,
        callbackUrl: job.callbackUrl,
      },
    });
  }

  return {
    init: init,
    success: success,
    listenToParent: listenToParent,
    tabMode: tabMode,
  };
})();

var alreadyInjected = false;

if (document.location.hash.startsWith("#rc2jdt")) {
  //history.pushState("", document.title, window.location.pathname + window.location.search);
  if (true) {
    try {
      // block document load
      document.open();
      document.write(intermediateBody);
      document.close();
    } catch (exception) {
      console.log(exception);
    }
  }
  if (document.head !== undefined && document.head !== null) {
    document.head.outerHTML = "";
  }
  clearDocument();

  document.body = document.createElement("body");
  document.body.outerHTML = intermediateBody;
  var doClearDocument = true;
  var contentLoaded = false;
  document.addEventListener("readystatechange", (state) => {
    try {
      if (doClearDocument) {
        clearDocument();
      }
      if (contentLoaded) {
        doClearDocument = false;
        if (alreadyInjected === false) {
          alreadyInjected = true;
          chrome.runtime.sendMessage(
            {
              name: "myjdrc2",
              action: "captcha-get",
            },
            (ev) => {
              console.log("captcha-get-readystatechange", ev);
            }
          );
        }
      }
    } catch (e) {
      console.error("readystatechange", e);
    }
  });

  window.addEventListener("DOMContentLoaded", (event) => {
    console.log(event);
    const bodies = document.getElementsByTagName("body");
    for (let i = 0; i < bodies.length; i++) {
      if (
        bodies[i].id !== "myjd-intermediate-captcha" &&
        bodies[i].id !== "myjd-captcha-solver"
      ) {
        bodies[i].parentElement.removeChild(bodies[i]);
      }
    }
    contentLoaded = true;
  });
}

let callbackScript =
  "window.onError = function(message, source, lineno, colno, error) { " +
  'console.error("ERROR", error);' +
  "};";

chrome.runtime.onMessage.addListener(function (msg) {
  // listen for background messages
  if (msg.name && msg.name === "myjdrc2") {
    if (msg.action && msg.action === "captcha-available") {
      chrome.runtime.sendMessage(
        {
          name: "myjdrc2",
          action: "captcha-get",
        },
        (ev) => {
          console.log("captcha-get-onmessage", ev);
        }
      );
    } else if (msg.action && msg.action === "captcha-set") {
      console.log("CAPTCHA PARAMS", msg);
      clearDocument();
      CaptchaFormInjector.init(msg.data);
    }
  }
});
CaptchaFormInjector.listenToParent();

function getInternetExplorerVersion() {
  let rv = -1;
  if (navigator.appName == "Microsoft Internet Explorer") {
    let ua = navigator.userAgent;
    let re = new RegExp("MSIE ([0-9]{1,}[.0-9]{0,})");
    if (re.exec(ua) != null) rv = parseFloat(RegExp.$1);
  } else if (navigator.appName == "Netscape") {
    let ua = navigator.userAgent;
    let re = new RegExp("Trident/.*rv:([0-9]{1,}[.0-9]{0,})");
    if (re.exec(ua) != null) rv = parseFloat(RegExp.$1);
  }
  return rv;
}

let debug = function () {
  if (_logCache !== undefined && _logCache.length > 0) {
    for (let i = 0; i < _logCache.length; i++) {
      console.log(_logCache[i]);
    }
  } else {
    console.log("no logs available");
  }
};
