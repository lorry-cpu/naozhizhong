const opener = require.resolve('../../launcher/open-browser.cjs')
require.cache[opener] = {
  id: opener,
  filename: opener,
  loaded: true,
  exports: { openBrowser: url => console.log(`BROWSER_OPEN:${url}`) }
}
