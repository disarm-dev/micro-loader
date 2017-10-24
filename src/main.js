import microloaderConfig from './../microloader.json'

const SW_SCRIPT_NAME = 'sw.js'
const ELEMENT_INCLUDES_ID = 'microloader-includes'

//
// Microloader
// -----------

let MicroLoader = {}
window.MicroLoader = MicroLoader

// State of MicroLoader
MicroLoader.state = {
  offlinePossible: false,
  // config.app_version => config
  configs: {},
  currentConfig: null,
  // When all assets in this array are cached we are ready for offline.
  // Client app can modify this array.
  requiredAssets: []
}

/*
  Start MicroLoader.
*/
MicroLoader.start = function() {
  console.log('[ML] Starting MicroLoader.')
  this.startServiceWorker()

  if (!this.state.offlinePossible) {
    return
  }

  this.afterServiceWorkerActivation(() => {
    this.registerMessageHandlersForServiceWorkers()

    // Import configuration bundled with the app first
    this.importConfig(microloaderConfig)
    // Send it to ServiceWorker
    this.sendConfigsToServiceWorker()
    // Ask ServiceWorker for full list of saved configurations
    // Response from ServiceWorker will trigger loading of initial assets
    this.askConfigsFromServiceWorker()
  }, 1000)
}

/*
  Check if service workers are available in the browser.
  If successful, register the worker.
*/
MicroLoader.startServiceWorker = function() {
  console.log('[ML] Starting service worker.')
  if ('serviceWorker' in navigator) {
    console.log('[ML] Service worker support is enabled.')
    this.state.offlinePossible = true

    navigator.serviceWorker.register(SW_SCRIPT_NAME).then(registration => {
      console.log('[ML] Registered service worker.')
    })
  } else {
    console.log('[ML] This browser does not support offline applications. Install latest version of Google Chrome or Mozilla Firefox')
    this.state.offlinePossible = false
  }
}

/*
  Service worker will not populate its controller right after the registration.
  There will be a slight delay.
  We wait for controller to appear, then execute sw-related functionality.
*/
MicroLoader.afterServiceWorkerActivation = function(cb, waitLimit) {
  console.log('[ML] Wating for service worker controller activation.')
  if (navigator.serviceWorker.controller) {
    console.log('[ML] Service worker controller is ready.')
    cb()
  } else {
    if (waitLimit > 0) {
      setTimeout(() => {MicroLoader.afterServiceWorkerActivation(cb, waitLimit - 50)}, 50)
    } else {
      console.log('[ML] Service worker controller failed to appear in reasonable time.')
    }
  }
}

/*
  Send our current configs to service worker for keeping.
*/
MicroLoader.sendConfigsToServiceWorker = function(forceCurrentConfig) {
  console.log('[ML] Sending current configs to service worker.')
  sendMessageToServiceWorker({
    action: 'saveConfigsInServiceWorker',
    payload: {
      configs: MicroLoader.state.configs,
      currentConfig: MicroLoader.state.currentConfig,
      forceCurrentConfig: forceCurrentConfig
    }
  })
}

/*
  Query ServiceWorker for saved configs and append them to our configs.
  We assume that all configs returned this way are already cached by ServiceWorker.
*/
MicroLoader.askConfigsFromServiceWorker = function() {
  console.log('[ML] Asking ServiceWorker for saved configs.')
  sendMessageToServiceWorker({
    action: 'askConfigsFromServiceWorker'
  })
}

/* 
  Query ServiceWorker for offline-readiness.
  We send list of required assets, and expect offline-readiness report to arrive frow ServiceWorker.
*/
MicroLoader.askOfflineReadinessFromServiceWorker = function() {
  console.log('[ML] Asking ServiceWorker for offline readiness with required assets:', this.state.requiredAssets)
  sendMessageToServiceWorker({
    action: 'askOfflineReadinessFromServiceWorker',
    payload: {
      requiredAssets: this.state.requiredAssets.map(name => versionedAssetName(name, this.state.currentConfig))
    }
  })
}

/*
  Register message handlers for messages from ServiceWorker.
*/
MicroLoader.registerMessageHandlersForServiceWorkers = function() {
  navigator.serviceWorker.addEventListener('message', event => {
    let message = event.data
    switch (message.action) {
      /*
        Get saved configs from ServiceWorker and merge them into client configs.
        Update currentConfig on client to be the same as in ServiceWorker.
      */
      case 'respondConfigsFromServiceWorker':
        console.log('[ML] Got saved configs from ServiceWorker:', message.payload)
        for (let config_id in message.payload.configs) {
          this.importConfig(message.payload.configs[config_id], message.payload.currentConfig.app_version == config_id)
        }
        this.loadInitialAssets()
        break;
      /*
        Get offline readiness report from ServiceWorker.
        Calls event handler in state.onReadinessReport with report as argument.
      */
      case 'respondOfflineReadinessFromServiceWorker':
        console.log('[ML] Got offline readiness report from ServiceWorker:', message.payload)
        this.state.offlineReadiness = message.payload.readinessReport
        if (this.state.onReadinessReport) {
          this.state.onReadinessReport(message.payload.readinessReport)
        }
        break;
      default:
        console.log('[ML] Got unregistered message from Service Worker:', message)
    }
  })
}

/*
  Add config to state. Make it current if there is no current config or if setAsCurrent is true.
*/
MicroLoader.importConfig = function(config, setAsCurrent) {
  console.log('[ML] Importing config:', config)
  this.state.configs[config.app_version] = config
  if (!this.state.currentConfig || setAsCurrent) {
    this.state.currentConfig = config
  }

  // Clone initial assets into requiredAssets
  this.state.requiredAssets = this.state.currentConfig.assets.initial.slice(0)
}

/*
  Load assets specifeid in 'initial' field and add them as script tags.
*/
MicroLoader.loadInitialAssets = function() {
  console.log('[ML] Loading initial assets for version:', this.state.currentConfig.app_version)
  const body = document.body
  // Container to hold dynamic scrpit tags
  const includes = document.createElement('div')
  includes.id = ELEMENT_INCLUDES_ID
  // Find old container and delete it
  let oldIncludes = document.getElementById(ELEMENT_INCLUDES_ID)
  if (oldIncludes) {
    body.removeChild(oldIncludes)
  }
  // Append new includes container to body and populate it with script tags generated from current config
  body.appendChild(includes)

  for (let asset of this.state.currentConfig.assets.initial) {
    // Process script asset
    if (asset.endsWith('.js')) {
      let script = document.createElement('script')
      script.src = versionedAssetName(asset, this.state.currentConfig)
      includes.appendChild(script)
    }
    // Process style asset
    if (asset.endsWith('.css')) {
      let link = document.createElement('link')
      link.href = versionedAssetName(asset, this.state.currentConfig)
      link.rel = 'stylesheet'
      includes.appendChild(link)
    }
  }
}

/*
  Set new current config and save it to ServiceWorker.
*/
MicroLoader.setCurrentConfig = function(version) {
  if (this.state.configs[version]) {
    this.state.currentConfig = this.state.configs[version]
    this.sendConfigsToServiceWorker(true)
    this.askConfigsFromServiceWorker()
  } else {
    console.log('[ML] Version ' + version + ' is not in configs.')
  }
}

/*
  Calculate offline-readiness percentage
*/
MicroLoader.offlineReadinessPercentage = function() {
  if (!this.state.offlineReadiness) {
    return 0
  }

  let stats = {ready: 0, total: 0}
  for (let name in this.state.offlineReadiness) {
    stats.total += 1
    if (this.state.offlineReadiness[name]) {
      stats.ready += 1
    }
  }

  return stats.ready / stats.total * 100
}

MicroLoader.start()

//
// Helpers
// -------

function versionedAssetName(name, config) {
  let path = name.substr(0, name.lastIndexOf('.'))
  let version = config.app_version
  let extension = name.substr(name.lastIndexOf('.'), name.length)
  return path + version + extension
}

function sendMessageToServiceWorker(message) {
  navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message)
    } else {
      console.error('[ML] Service worker controller is not available')
    }
  })
}