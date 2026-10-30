const visual = document.querySelector('.visual')
const start = document.querySelector('.start')
const status = document.querySelector('.status')
const masterControl = document.querySelector('#master')
const cards = document.querySelectorAll('.module')

const layers = Array.from(cards, (card, index) => ({
  card,
  index,
  enabled: false,
  solo: false,
  volume: card.querySelector('[data-param=volume]'),
  tone: card.querySelector('[data-param=tone]'),
  next: 0,
  step: 0,
  bus: null
}))

const ambient = {
  bus: null,
  next: 0,
  step: 0,
  tone: { value: 35 }
}

let context
let master
let compressor
let delay
let delayGain
let feedback
let timer
let reactionTimer
let running = false

function initAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext

  if (!AudioContextClass) {
    throw new Error('Web Audio не поддерживается')
  }

  context = new AudioContextClass()
  master = context.createGain()
  master.gain.value = 0

  compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -20
  compressor.ratio.value = 4
  master.connect(compressor)
  compressor.connect(context.destination)

  delay = context.createDelay()
  delay.delayTime.value = 0.36
  feedback = context.createGain()
  feedback.gain.value = 0.18
  delayGain = context.createGain()
  delayGain.gain.value = 0.16

  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(delayGain)
  delayGain.connect(master)

  ambient.bus = context.createGain()
  ambient.bus.gain.value = 0
  ambient.bus.connect(master)
  ambient.bus.connect(delay)

  layers.forEach((layer) => {
    layer.bus = context.createGain()
    layer.bus.gain.value = 0
    layer.bus.connect(master)
    layer.bus.connect(delay)
  })
}

function updateMix() {
  const soloed = layers.some((layer) => layer.solo && layer.enabled)

  if (context) {
    const now = context.currentTime
    const masterVolume = running ? (Number(masterControl.value) / 100) * 0.42 : 0
    const ambientVolume = running && !soloed ? 0.45 : 0

    master.gain.setTargetAtTime(masterVolume, now, 0.08)
    ambient.bus.gain.setTargetAtTime(ambientVolume, now, 0.3)

    layers.forEach((layer) => {
      const audible = running && layer.enabled && (!soloed || layer.solo)
      const volume = audible ? Number(layer.volume.value) / 100 : 0
      layer.bus.gain.setTargetAtTime(volume, now, 0.1)
    })
  }

  const activeLayers = layers.filter((layer) => layer.enabled)
  const amount = activeLayers.length
    ? activeLayers.reduce((sum, layer) => sum + Number(layer.tone.value), 0) /
      activeLayers.length
    : 40

  visual.style.setProperty('--speed', `${Math.max(3.2, 9 - amount / 18)}s`)
  visual.style.setProperty('--speed2', `${Math.max(2.8, 7 - amount / 22)}s`)
  visual.style.setProperty('--hue', '0deg')
  visual.style.setProperty('--blush', `${0.35 + amount / 160}`)
  visual.style.setProperty(
    '--brightness',
    `${0.85 + (Number(masterControl.value) / 100) * 0.3}`
  )
}

function reactToControl(layer) {
  if (!running) return

  const tone = Number(layer.tone.value)
  const volume = Number(layer.volume.value)

  visual.style.setProperty('--reaction-x', `${20 + layer.index * 20}%`)
  visual.style.setProperty('--reaction-y', `${70 - tone * 0.4}%`)
  visual.style.setProperty('--reaction-strength', `${0.25 + volume * 0.004}`)
  visual.classList.toggle('reacting', true)

  clearTimeout(reactionTimer)
  reactionTimer = setTimeout(() => {
    visual.classList.toggle('reacting', false)
  }, 700)
}

function note(layer, frequency, time, duration, type = 'sine', level = 0.1) {
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  const filter = context.createBiquadFilter()

  oscillator.type = type
  oscillator.frequency.value = frequency
  filter.type = 'lowpass'
  filter.frequency.value = 400 + Number(layer.tone.value) * 25

  envelope.gain.setValueAtTime(0.0001, time)
  envelope.gain.exponentialRampToValueAtTime(
    level,
    time + Math.min(0.6, duration * 0.25)
  )
  envelope.gain.setValueAtTime(level, time + duration * 0.65)
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration)

  oscillator.connect(filter)
  filter.connect(envelope)
  envelope.connect(layer.bus)
  oscillator.start(time)
  oscillator.stop(time + duration + 0.03)
}

function schedule(layer, time) {
  const step = layer.step++
  const tone = Number(layer.tone.value) / 100

  if (layer.index === 0) {
    const roots = [130.81, 110, 146.83, 98]
    const frequency = roots[step % roots.length]
    note(layer, frequency, time, 5.2, 'sine', 0.14)
    note(layer, frequency * 1.5, time, 5.2, 'triangle', 0.035)
    return 4.5
  }

  if (layer.index === 1) {
    const notes = [261.63, 329.63, 392, 440, 329.63, 293.66, 261.63, 220]
    const frequency = notes[step % notes.length] * (tone > 0.67 ? 2 : 1)
    note(layer, frequency, time, 2.8, 'sine', 0.09)
    return 1.6
  }

  if (layer.index === 2) {
    const chords = [
      [130.81, 164.81, 196],
      [110, 130.81, 164.81],
      [146.83, 174.61, 220],
      [98, 123.47, 146.83]
    ]
    chords[step % chords.length].forEach((frequency) => {
      note(layer, frequency, time, 5.4, 'triangle', 0.045)
    })
    return 4.5
  }

  const pitches = [523.25, 659.25, 587.33, 783.99]
  note(layer, pitches[step % pitches.length], time, 1.2, 'triangle', 0.11)
  return 1.8 - tone * 0.8
}

function tick() {
  if (!running) return

  const now = context.currentTime

  if (ambient.next < now + 0.12) {
    const roots = [130.81, 110, 146.83, 98]
    const frequency = roots[ambient.step++ % roots.length]
    note(ambient, frequency, now + 0.03, 9, 'sine', 0.075)
    note(ambient, frequency * 1.5, now + 0.03, 9, 'sine', 0.035)
    ambient.next = now + 7.5
  }

  layers.forEach((layer) => {
    if (layer.enabled && layer.next < now + 0.12) {
      layer.next = now + schedule(layer, now + 0.03)
    }
  })
}

start.addEventListener('click', async () => {
  if (!running) {
    try {
      if (!context) initAudio()
      await context.resume()
    } catch (error) {
      status.textContent = 'ЗВУК НЕДОСТУПЕН'
      return
    }

    running = true
    ambient.next = 0
    layers.forEach((layer) => {
      layer.next = 0
    })
    timer = setInterval(tick, 120)
    tick()
  } else {
    running = false
    clearInterval(timer)
    clearTimeout(reactionTimer)
    visual.classList.toggle('reacting', false)
  }

  visual.classList.toggle('running', running)
  start.setAttribute('aria-pressed', String(running))
  start.setAttribute(
    'aria-label',
    running ? 'Остановить синтезатор' : 'Запустить синтезатор'
  )
  status.textContent = running ? 'ВОСПРОИЗВЕДЕНИЕ' : 'ОСТАНОВЛЕНО'
  updateMix()
})

cards.forEach((card, index) => {
  const layer = layers[index]
  const toggle = card.querySelector('.toggle')
  const solo = card.querySelector('.solo')

  toggle.addEventListener('click', () => {
    layer.enabled = !layer.enabled
    if (!layer.enabled) layer.solo = false
    layer.next = 0
    card.classList.toggle('active', layer.enabled)
    toggle.setAttribute('aria-pressed', String(layer.enabled))
    toggle.textContent = layer.enabled ? 'ВЫКЛЮЧИТЬ' : 'ВКЛЮЧИТЬ'
    solo.setAttribute('aria-pressed', String(layer.solo))
    updateMix()
    reactToControl(layer)
    if (running) tick()
  })

  solo.addEventListener('click', () => {
    if (!layer.enabled) {
      layer.enabled = true
      card.classList.add('active')
      toggle.textContent = 'ВЫКЛЮЧИТЬ'
      toggle.setAttribute('aria-pressed', 'true')
      layer.next = 0
    }
    layer.solo = !layer.solo
    solo.setAttribute('aria-pressed', String(layer.solo))
    updateMix()
    reactToControl(layer)
    if (running) tick()
  })

  ;[layer.volume, layer.tone].forEach((input) => {
    input.addEventListener('input', () => {
      updateMix()
      reactToControl(layer)
    })
  })
})

masterControl.addEventListener('input', updateMix)
updateMix()
