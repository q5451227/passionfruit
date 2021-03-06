const frida = require('frida')
const { DeviceNotFoundError, AppAttachError } = require('./error')


async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}


async function retry(operation, options) {
  if (typeof operation !== 'function') throw new Error('operation should be a function')

  const opt = options || {}
  let times = opt.retry || 10
  const interval = opt.interval || 200
  while (--times > 0) {
    try {
      return operation()
    } catch (ignored) {
      console.log(ignored)
    }
    await sleep(interval)
  }

  throw new Error('max retry exceed')
}


class FridaUtil {
  static async getDevice(id) {
    const list = await frida.enumerateDevices()
    const dev = list.find(d => d.id === id)
    if (dev) return dev
    throw new DeviceNotFoundError(id)
  }

  // spawn and wait until it's ready
  static async spawn(dev, app) {
    const pid = await dev.spawn([app.identifier])
    const session = await dev.attach(pid)
    await dev.resume(pid)

    const probeScript = await session.createScript(`
      Module.ensureInitialized('Foundation'); rpc.exports.ok = function() { return true }`)

    await probeScript.load()
    try {
      const ok = await retry(probeScript.exports.ok.bind(probeScript.exports))
      if (!ok) throw new AppAttachError(app.identifier)
    } catch (ex) {
      if (/FBSOpenApplicationErrorDomain error 7/.exec(ex)) throw Error('device is locked')
      console.error(ex)
      await session.detach()
      throw new AppAttachError(app.identifier)
    }
    return session
  }
}


function serializeIcon(icon) {
  if (!icon) return icon
  const { pixels, height, width, rowstride } = icon
  return { width, height, rowstride, pixels: pixels.toString('base64') }
}

function serializeDevice(dev) {
  const { name, id, icon, type } = dev
  return { name, id, icon: serializeIcon(icon), type }
}

function serializeApp(app) {
  const { name, id, smallIcon, largeIcon, identifier } = app
  return {
    name,
    id,
    identifier,
    smallIcon: serializeIcon(smallIcon),
    largeIcon: serializeIcon(largeIcon),
  }
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8)
    return v.toString(16)
  })
}


module.exports = {
  FridaUtil,
  serializeDevice,
  serializeApp,
  sleep,
  retry,
  uuidv4,
}
