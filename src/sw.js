const CACHE_NAME = 'MicroLoader'
const LOADER_SCRIPT_NAME = 'loader.js'

//
// Functionality
//

let Worker = {}

Worker.state = {
  configs: {},
  currentConfig: null
}

/*
  Initialize message handlers
*/
Worker.start = function() {
  self.addEventListener('message', event => {
    this.handleMessage(event.data, event)
  })
}

/*
  Handle incoming messages from clients.
*/
Worker.handleMessage = function(message, event) {
  switch (message.action) {
    /*
      Merge configs from client into ServiceWorker state.
      If currentConfig is not set, make it the same as on client.
    */
    case 'saveConfigsInServiceWorker':
      console.log('[SW] Saving configs from client', message.payload)
      // Merge configs from client
      for (let config_id in message.payload.configs) {
        this.state.configs[config_id] = message.payload.configs[config_id]
      }

      console.log('[SW] Current configs:', this.state.configs)
      // Update current config
      if (!this.state.currentConfig || message.payload.forceCurrentConfig) {
        console.log('[SW] Updating current config to be the same as in client', message.payload.currentConfig)
        this.state.currentConfig = message.payload.currentConfig
      }

      console.log('[SW] Updating cache matchers from configs')
      // Update cache matchers
      self.caches.open(CACHE_NAME).then(cache => {
        let matchers = []
        for (config_id in this.state.configs) {
          matchers = matchers.concat(generateCacheMatchersFromConfig(this.state.configs[config_id]))
        }
        console.log('[SW] Adding cache matchers:', matchers)
        cache.addAll(matchers)
      })
      break;
    case 'askConfigsFromServiceWorker':
      self.clients.matchAll().then(clients => {
        for (let client of clients) {
          if (client.id == event.source.id) {
            let payload = {
              configs: this.state.configs,
              currentConfig: this.state.currentConfig
            }
            console.log('[SW] Sending configs to client', payload)
            client.postMessage({action: 'respondConfigsFromServiceWorker', payload: payload})
          }
        }
      })
      break;
    /*
      Check cache for all required assets and report back which ones are offline-ready
    */
    case 'askOfflineReadinessFromServiceWorker':
      self.clients.matchAll().then(clients => {
        for (let client of clients) {
          if (client.id == event.source.id) {
            self.caches.open(CACHE_NAME)
            .then(cache => {
              return Promise.all(message.payload.requiredAssets.map(name => cache.match(name)))
            })
            .then(matches => {
              let readinessReport = matches.reduce((acc, match) => {
                let isMatched = false
                if (match) {
                  isMatched = true
                }

                acc.readiness[message.payload.requiredAssets[acc.index]] = isMatched
                acc.index += 1
                return acc
              }, {index: 0, readiness: {}})

              let payload = {
                readinessReport: readinessReport.readiness
              }
              console.log('[SW] Sending matches to client', payload)
              client.postMessage({action: 'respondOfflineReadinessFromServiceWorker', payload: payload})
            })
          }
        }
      })
      break;
    default:
      console.log('[SW] Got unregistered message from client:', message)
  }
}

Worker.start()

//
// Events
// ------

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => {
    cache.addAll([
      '/',
      '/index.html'
    ])
    console.log('[SW] Installing service worker.')
    self.skipWaiting()
  }))
})

self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker.')
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  console.log('[SW] Fetching from:', event.request.url)
  // Try to update loader first. If request fails, we return cached version
  if (shouldFetchFirst(event.request.url)) {
    console.log('[SW] Attempting to fetch first.')
    event.respondWith(fetch(event.request).catch(err => {
      console.log('[SW] Fetch failed. Serving from cache.')
      return fromCache(event.request)
    }))
  } else {
    console.log('[SW] Serving from cache.')
    event.respondWith(fromCache(event.request))
  }
})

//
// Helpers
// -------

function versionedAssetName(name, config) {
  let path = name.substr(0, name.lastIndexOf('.'))
  let version = config.app_version
  let extension = name.substr(name.lastIndexOf('.'), name.length)
  return path + version + extension
}

function versionedLoaderName(name, config) {
  let path = name.substr(0, name.lastIndexOf('.'))
  let version = config.loader_version
  let extension = name.substr(name.lastIndexOf('.'), name.length)
  return path + version + extension
}

function generateCacheMatchersFromConfig(config) {
  let loader = ['/' + versionedLoaderName(LOADER_SCRIPT_NAME, config)]
  let initial = config.assets.initial.map(uri => '/' + versionedAssetName(uri, config))
  let runtime = config.assets.runtime.map(uri => '/' + versionedAssetName(uri, config))
  let universal = config.assets.universal

  return loader.concat(initial).concat(runtime).concat(universal)
}

/*
  index.html and loader.js should be accessed with network-first strategy.
  Everything else is cache-first.
*/
function shouldFetchFirst(uri) {
  const url = new URL(uri)
  const loaderScriptName = '/' + LOADER_SCRIPT_NAME.split('.')[0]
  if (url.pathname == '/' || url.pathname.startsWith(loaderScriptName)) {
    return true
  } else {
    return false
  }
}

function fromCache(request) {
  return caches.open(CACHE_NAME).then(cache => {
    return cache.match(request).then(matching => {
      return matching || fetch(request)
    })
  })
}