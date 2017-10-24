console.log('My version is 1')
import microloaderConfig from './../microloader.json'
const appText = 'Hello, I am an app fetched by MicroLoader. My version is ' + microloaderConfig.app_version
let body = document.body
/*
  Recreate <div id='app'></div>
*/
let oldApp = document.getElementById('app')
if (oldApp) {
  body.removeChild(oldApp)
}
let app = document.createElement('div')
app.id = 'app'
body.appendChild(app)

/*
  Put some content
*/
let p = document.createElement('p')
p.innerText = appText
app.appendChild(p)

/*
  Microloader integration
*/
let o = document.createElement('p')
o.innerText = 'ServiceWorker enabled: ' + MicroLoader.state.offlinePossible
app.appendChild(o)