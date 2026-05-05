

// ── Typewriter engine for hero title + paragraphs ──
function typeText(root = document) {
  const lines = root.querySelectorAll('.typewriter-line')
  const title = root.querySelector('.hero-title')
  const SPEED = 35
  const START_DELAY = 600

  const extractPlainText = (html) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    const text = tmp.textContent
    tmp.remove()
    return text
  }

  const typeLine = (line, delay) => {
    setTimeout(() => {
      const fullHTML = line.getAttribute('data-html')
      const plain = extractPlainText(fullHTML)
      const textSpan = line.querySelector('.typed-text')
      const cursor = line.querySelector('.typing-cursor')
      if (!textSpan || !cursor || !plain) return

      cursor.classList.add('active')
      let i = 0
      const tick = () => {
        if (i < plain.length) {
          textSpan.textContent += plain[i]
          i++
          setTimeout(tick, SPEED + Math.random() * 25)
        } else {
          textSpan.innerHTML = fullHTML
          line.querySelectorAll('strong').forEach((s, idx) => {
            s.style.animationDelay = `${idx * 0.15}s`
            s.classList.add('strong-highlight')
            s.addEventListener('animationend', () => s.classList.remove('strong-highlight'), { once: true })
          })
          cursor.style.animationDelay = '0.8s'
          cursor.style.animationDuration = '0.4s'
          cursor.style.animationIterationCount = '3'
          setTimeout(() => { cursor.classList.remove('active') }, 2000)
        }
      }
      tick()
    }, delay)
  }

  let totalDelay = START_DELAY

  // Type the title first
  if (title) {
    const titleText = title.getAttribute('data-html')
    const plainTitle = extractPlainText(titleText)
    const titleTextSpan = title.querySelector('.typed-text')
    const titleCursor = title.querySelector('.typing-cursor')
    if (titleTextSpan && titleCursor && plainTitle) {
      setTimeout(() => {
        titleCursor.classList.add('active')
        let i = 0
        const tick = () => {
          if (i < plainTitle.length) {
            titleTextSpan.textContent += plainTitle[i]
            i++
            setTimeout(tick, SPEED + Math.random() * 25)
          } else {
            titleTextSpan.innerHTML = titleText
            titleCursor.classList.remove('active')
          }
        }
        tick()
      }, totalDelay)
      totalDelay += plainTitle.length * (SPEED + 12) + 400
    }
  }

  // Then type the paragraphs
  lines.forEach((line) => {
    typeLine(line, totalDelay)
    const plain = extractPlainText(line.getAttribute('data-html'))
    totalDelay += plain.length * (SPEED + 12) + 400
  })
}


// ── Screenshot gallery + lightbox ──
async function renderGallery() {
  const grid = document.getElementById('screenshot-grid')
  if (!grid) return

  let items = window.screenshots || []
  // try {
  //   const res = await fetch(new URL('screenshots.json').href, { cache: 'no-cache' })
  //   items = await res.json()
  // } catch (err) {
  //   console.warn('Could not load screenshots manifest', err)
  //   grid.removeAttribute('aria-busy')
  //   grid.removeAttribute('data-loading')
  //   return
  // }

  const frag = document.createDocumentFragment()
  items.forEach((it, i) => {
    const fig = document.createElement('figure')
    fig.className = `screenshot-card fade-blur delay-${(i % 5) + 1}`
    fig.tabIndex = 0
    fig.setAttribute('role', 'button')
    fig.setAttribute('aria-label', `Open screenshot: ${it.caption}`)
    fig.dataset.index = String(i)

    const img = document.createElement('img')
    img.src = it.src
    img.alt = it.alt
    img.loading = 'lazy'

    const cap = document.createElement('figcaption')
    cap.textContent = it.caption

    fig.append(img, cap)
    frag.append(fig)
  })
  grid.append(frag)
  grid.removeAttribute('aria-busy')
  grid.removeAttribute('data-loading')

  // Re-observe the new cards for fade-blur entry
  grid.querySelectorAll('.fade-blur').forEach((el) => observer.observe(el))

  // ── Lightbox wiring ──
  const dlg = document.getElementById('lightbox')
  const lbImg = document.getElementById('lightbox-img')
  const lbCap = document.getElementById('lightbox-caption')
  const lbCount = document.getElementById('lightbox-counter')
  const btnPrev = document.getElementById('lightbox-prev')
  const btnNext = document.getElementById('lightbox-next')
  const btnX = document.getElementById('lightbox-close')

  let currentIndex = 0
  let lastTrigger = null
  let swapping = false

  let touchStartX = 0
  let touchStartY = 0
  let touchEndX = 0
  let touchEndY = 0
  const SWIPE_THRESHOLD = 50
  let touchStartTime = 0
  let imgTouchStartX = 0
  let imgDragDelta = 0

  const clearAnimClasses = () => {
    lbImg.classList.remove('opening', 'swap-out-left', 'swap-out-right', 'swap-in-left', 'swap-in-right')
  }

  const setImage = (idx, dir = 0) => {
    const it = items[((idx % items.length) + items.length) % items.length]
    if (!it) return
    currentIndex = ((idx % items.length) + items.length) % items.length
    lbCap.textContent = it.caption
    lbCount.textContent = `${currentIndex + 1} / ${items.length}`

    if (dir === 0) {
      clearAnimClasses()
      lbImg.src = it.src
      lbImg.alt = it.alt
      void lbImg.offsetWidth
      lbImg.classList.add('opening')
      lbImg.addEventListener('animationend', () => lbImg.classList.remove('opening'), { once: true })

      return
    }
    if (swapping) return
    swapping = true
    const outClass = dir > 0 ? 'swap-out-left' : 'swap-out-right'
    const inClass = dir > 0 ? 'swap-in-left' : 'swap-in-right'
    clearAnimClasses()
    void lbImg.offsetWidth
    lbImg.classList.add(outClass)
    const onOut = () => {
      lbImg.classList.remove(outClass)
      lbImg.src = it.src
      lbImg.alt = it.alt
      void lbImg.offsetWidth
      lbImg.classList.add(inClass)
      const onIn = () => {
        lbImg.classList.remove(inClass)
        swapping = false
      }
      lbImg.addEventListener('animationend', onIn, { once: true })
    }
    lbImg.addEventListener('animationend', onOut, { once: true })
  }

  const openAt = (idx, trigger) => {
    lastTrigger = trigger || null
    if (typeof dlg.showModal === 'function') dlg.showModal()
    else dlg.setAttribute('open', '')
    setImage(idx, 0)
  }

  const close = () => {
    if (!dlg.open) return
    dlg.classList.add('closing')
    const done = () => {
      dlg.classList.remove('closing')
      dlg.removeEventListener('animationend', done)
      dlg.close()
      if (lastTrigger) lastTrigger.focus()
    }
    const t = setTimeout(done, 400)
    dlg.addEventListener('animationend', () => {
      clearTimeout(t)
      done()
    }, { once: true })
  }

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.screenshot-card')
    if (!card) return
    openAt(Number(card.dataset.index), card)
  })
  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest('.screenshot-card')
    if (!card) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openAt(Number(card.dataset.index), card)
    }
  })

  btnPrev.addEventListener('click', () => setImage(currentIndex - 1, -1))
  btnNext.addEventListener('click', () => setImage(currentIndex + 1, +1))
  btnX.addEventListener('click', close)

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setImage(currentIndex - 1, -1)
    }
    else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setImage(currentIndex + 1, +1)
    }
  })
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault()
    close()
  })
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg)
      close()
  })

  // ── Touch swipe gestures ──
  dlg.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0]
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchStartTime = performance.now()
  }, { passive: true })

  dlg.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0]
    touchEndX = touch.clientX
    touchEndY = touch.clientY
    const dx = touchEndX - touchStartX
    const dy = touchEndY - touchStartY
    if (dx < -SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault()
      setImage(currentIndex + 1, 1)
    }
    else if (dx > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault()
      setImage(currentIndex - 1, -1)
    }
    else if (dy > SWIPE_THRESHOLD * 1.5 && Math.abs(dy) > Math.abs(dx)) {
      e.preventDefault()
      close()
    }
  }, { passive: false })

  dlg.addEventListener('touchmove', (e) => {
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStartX
    const dy = touch.clientY - touchStartY
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      e.preventDefault()
    }
  }, { passive: false })

  // ── Touch drag on image ──
  lbImg.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0]
    imgTouchStartX = touch.clientX
    imgDragDelta = 0
  }, { passive: true })

  lbImg.addEventListener('touchmove', (e) => {
    const touch = e.changedTouches[0]
    imgDragDelta = touch.clientX - imgTouchStartX
    if (Math.abs(imgDragDelta) > 5) {
      lbImg.style.transform = `translateX(${imgDragDelta * 0.3}px) scale(0.98)`
    }
  }, { passive: true })

  lbImg.addEventListener('touchend', (e) => {
    if (Math.abs(imgDragDelta) > SWIPE_THRESHOLD) {
      if (imgDragDelta < 0) setImage(currentIndex + 1, 1)
      else setImage(currentIndex - 1, -1)
    }
    lbImg.style.transform = ''
    imgDragDelta = 0
  }, { passive: true })
}

// ── Pointer light source (multi-touch, candle flicker, decay on release) ──
function applyLighting() {
  const canvas = document.getElementById('pointer-light')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  const points = new Map()
  let dpr = 1
  let baseR = 0
  let accentRGB = '255, 0, 119'

  const readAccent = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    if (!v) return
    const probe = document.createElement('span')
    probe.style.color = v
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    document.body.removeChild(probe)
    const m = c.match(/(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/)
    if (m) accentRGB = `${m[1]}, ${m[2]}, ${m[3]}`
  }

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(innerWidth * dpr)
    canvas.height = Math.floor(innerHeight * dpr)
    canvas.style.width = innerWidth + 'px'
    canvas.style.height = innerHeight + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    baseR = Math.min(innerWidth, innerHeight) * 0.18
  }

  const upsert = (id, x, y) => {
    const cur = points.get(id)
    if (cur) {
      cur.tx = x
      cur.ty = y
      cur.intensity = 1
      cur.radius = baseR
      cur.released = false
    }
    else points.set(id, {
      x,
      y,
      tx: x,
      ty: y,
      intensity: 1,
      radius: baseR,
      released: false,
      seed: Math.random() * 1000,
      prevFlicker: 1,
    })
  }
  const release = (id) => {
    const p = points.get(id)
    if (p)
      p.released = true
  }

  const flickerNoise = (t, seed) => {
    const a = Math.sin(t * 11.7 + seed) * 0.5
    const b = Math.sin(t * 4.3 + seed * 1.7) * 0.3
    const c = Math.sin(t * 23.1 + seed * 0.6) * 0.18
    const d = Math.sin(t * 2.1 + seed * 2.3) * 0.12
    const gust = Math.max(0, Math.sin(t * 1.3 + seed * 3.1) - 0.7) * 1.6
    return 1 + (a + b + c + d) * 0.18 - gust * 0.35
  }

  let last = performance.now()
  const draw = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = now / 1000

    ctx.clearRect(0, 0, innerWidth, innerHeight)
    ctx.globalCompositeOperation = 'lighter'

    for (const [id, p] of points) {
      const lerp = reduced ? 1 : 0.35
      p.x += (p.tx - p.x) * lerp
      p.y += (p.ty - p.y) * lerp

      if (p.released) {
        p.intensity *= Math.pow(0.96, dt * 60)
        p.radius *= Math.pow(1.02, dt * 60)
        if (p.intensity < 0.02) {
          points.delete(id)
          continue
        }
      }

      let flicker = reduced ? 1 : flickerNoise(t, p.seed)
      flicker = p.prevFlicker + (flicker - p.prevFlicker) * 0.6
      p.prevFlicker = flicker
      flicker = Math.max(0.55, Math.min(1.25, flicker))

      const jitterX = reduced ? 0 : Math.sin(t * 7.3 + p.seed) * baseR * 0.012
      const jitterY = reduced ? 0 : Math.sin(t * 9.1 + p.seed * 1.9) * baseR * 0.012

      const cx = p.x + jitterX
      const cy = p.y + jitterY
      const r = p.radius * (0.9 + 0.18 * flicker)
      const inner = 0.55 * p.intensity * flicker
      const mid = 0.18 * p.intensity * flicker

      const warmR = Math.min(255, Number(accentRGB.split(',')[0]) + 30 * flicker)
      const warmG = Math.min(255, Number(accentRGB.split(',')[1]) + 60 * flicker)
      const warmB = Number(accentRGB.split(',')[2])

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, `rgba(${warmR}, ${warmG}, ${warmB}, ${inner})`)
      grad.addColorStop(0.35, `rgba(${accentRGB}, ${mid})`)
      grad.addColorStop(1, `rgba(${accentRGB}, 0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    requestAnimationFrame(draw)
  }

  readAccent()
  resize()
  addEventListener('resize', resize, { passive: true })

  addEventListener('pointermove', (e) => upsert(e.pointerId, e.clientX, e.clientY), { passive: true })
  addEventListener('pointerdown', (e) => upsert(e.pointerId, e.clientX, e.clientY), { passive: true })
  addEventListener('pointerup', (e) => release(e.pointerId), { passive: true })
  addEventListener('pointercancel', (e) => release(e.pointerId), { passive: true })
  addEventListener('pointerleave', (e) => release(e.pointerId), { passive: true })
  document.addEventListener('mouseleave', () => { for (const id of points.keys()) release(id) })

  requestAnimationFrame(draw)
}

// ── Hero canvas: sine waves + wireframe stars + cursor gradient ──
function drawEffects() {
  const canvas = document.getElementById('hero-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const overlay = document.querySelector('.hero-gradient-overlay')
  const hBloom = document.querySelector('.hero-h-bloom')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const waveformContainer = document.querySelector('.hero-waveform')

  let dpr = 1
  let W = 0, H = 0
  let mouseX = -1000, mouseY = -1000
  let smoothMouseX = -1000, smoothMouseY = -1000
  let gradX = -1000, gradY = -1000
  let scrollPanX = 0, scrollPanY = 0

  const STAR_COUNT = 55
  const WAVE_BAND = 0.14        // fraction of H around wave Y where stars are suppressed
  const NEAREST_K = 3           // connections per vertex
  const HIGHLIGHT_RADIUS = 380
  const FLARE_RADIUS = 180
  const stars = []
  const sparks = []
  const gravityWaves = []
  let prevHighlightedEdges = new Set()
  let lastProminentEdgeKey = null

  const generateStars = () => {
    stars.length = 0
    const waveY = H * 0.55
    const bandTop = waveY - H * WAVE_BAND
    const bandBot = waveY + H * WAVE_BAND
    for (let i = 0; i < STAR_COUNT; i++) {
      let y
      do {
        y = Math.random() * H
      } while (y > bandTop && y < bandBot && Math.random() > 0.15)
      stars.push({
        x: Math.random() * W,
        y,
        size: Math.random() * 1.8 + 0.6,
        baseAlpha: Math.random() * 0.06 + 0.01,
      })
    }
  }

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const hero = document.getElementById('hero')
    W = hero.offsetWidth
    H = hero.offsetHeight
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    generateStars()
  }

  const onPointerMove = (e) => {
    const rect = canvas.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
  }
  const onPointerLeave = () => {
    mouseX = -1000
    mouseY = -1000
  }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true })
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true })
  document.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
  }, { passive: true })

  const updateGradient = (gx, gy) => {
    if (!overlay) return
    const nx = gx / W
    const ny = gy / H
    const angle = 120 + (nx - 0.5) * 30 + (ny - 0.5) * 15
    const hueShift1 = (nx - 0.5) * 20
    const hueShift2 = (ny - 0.5) * 15

    overlay.style.background = `linear-gradient(
      ${angle}deg,
      hsl(${340 + hueShift1} 80% 85% / 0.10) 0%,
      hsl(${280 + hueShift2} 70% 80% / 0.08) 35%,
      hsl(${220 - hueShift1} 75% 82% / 0.10) 65%,
      hsl(${300 + hueShift2} 60% 88% / 0.08) 100%
    )`

    if (hBloom) {
      hBloom.style.transform = `translateY(${gy}px)`
    }
  }

  const drawFlare = (x, y, alpha, radius) => {
    if (alpha < 0.05) return
    const len = radius * 3.5
    const thin = radius * 0.2

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha

    const outerGrad = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 2)
    outerGrad.addColorStop(0, `rgba(80, 200, 255, ${alpha * 0.2})`)
    outerGrad.addColorStop(1, 'rgba(150, 80, 255, 0)')
    ctx.fillStyle = outerGrad
    ctx.beginPath()
    ctx.arc(x, y, radius * 2, 0, Math.PI * 2)
    ctx.fill()

    const hGrad = ctx.createLinearGradient(x - len, y, x + len, y)
    hGrad.addColorStop(0, 'rgba(80, 200, 255, 0)')
    hGrad.addColorStop(0.35, `rgba(120, 220, 255, ${alpha * 0.6})`)
    hGrad.addColorStop(0.5, `rgba(180, 240, 255, ${alpha})`)
    hGrad.addColorStop(0.65, `rgba(120, 220, 255, ${alpha * 0.6})`)
    hGrad.addColorStop(1, 'rgba(80, 200, 255, 0)')
    ctx.fillStyle = hGrad
    ctx.fillRect(x - len, y - thin, len * 2, thin * 2)

    const vGrad = ctx.createLinearGradient(x, y - len * 0.7, x, y + len * 0.7)
    vGrad.addColorStop(0, 'rgba(80, 200, 255, 0)')
    vGrad.addColorStop(0.35, `rgba(120, 220, 255, ${alpha * 0.5})`)
    vGrad.addColorStop(0.5, `rgba(180, 240, 255, ${alpha * 0.9})`)
    vGrad.addColorStop(0.65, `rgba(120, 220, 255, ${alpha * 0.5})`)
    vGrad.addColorStop(1, 'rgba(80, 200, 255, 0)')
    ctx.fillStyle = vGrad
    ctx.fillRect(x - thin, y - len * 0.7, thin * 2, len * 1.4)

    const diagLen = len * 0.6
    const diagThin = thin * 0.6
    ctx.rotate(Math.PI / 4)
    const dGrad1 = ctx.createLinearGradient(x - diagLen, y, x + diagLen, y)
    dGrad1.addColorStop(0, 'rgba(80, 200, 255, 0)')
    dGrad1.addColorStop(0.5, `rgba(120, 220, 255, ${alpha * 0.4})`)
    dGrad1.addColorStop(1, 'rgba(80, 200, 255, 0)')
    ctx.fillStyle = dGrad1
    ctx.fillRect(x - diagLen, y - diagThin, diagLen * 2, diagThin * 2)
    ctx.rotate(-Math.PI / 2)
    const dGrad2 = ctx.createLinearGradient(x - diagLen, y, x + diagLen, y)
    dGrad2.addColorStop(0, 'rgba(80, 200, 255, 0)')
    dGrad2.addColorStop(0.5, `rgba(120, 220, 255, ${alpha * 0.4})`)
    dGrad2.addColorStop(1, 'rgba(80, 200, 255, 0)')
    ctx.fillStyle = dGrad2
    ctx.fillRect(x - diagLen, y - diagThin, diagLen * 2, diagThin * 2)
    ctx.rotate(Math.PI / 4)

    const cGrad = ctx.createRadialGradient(x, y, 0, x, y, radius)
    cGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
    cGrad.addColorStop(0.2, `rgba(255, 230, 245, ${alpha * 0.7})`)
    cGrad.addColorStop(0.5, `rgba(255, 200, 225, ${alpha * 0.3})`)
    cGrad.addColorStop(1, 'rgba(255, 180, 210, 0)')
    ctx.fillStyle = cGrad
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  const spawnSparks = (x1, y1, x2, y2, count = 12) => {
    for (let i = 0; i < count; i++) {
      const t = Math.random()
      const px = x1 + (x2 - x1) * t
      const py = y1 + (y2 - y1) * t
      const angle = Math.atan2(y2 - y1, x2 - x1) + (Math.random() - 0.5) * Math.PI * 0.8
      const speed = 0.5 + Math.random() * 2
      sparks.push({
        x: px, y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: 0.8 + Math.random() * 1.5,
        hue: 320 + Math.random() * 40,
      })
    }
  }

  const drawSparks = () => {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]
      s.x += s.vx
      s.y += s.vy
      s.vy += 0.02
      s.life -= s.decay
      if (s.life <= 0) { sparks.splice(i, 1); continue }
      ctx.globalAlpha = s.life * 0.9
      ctx.fillStyle = `hsl(${s.hue}, 100%, ${70 + s.life * 30}%)`
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  const spawnGravityWave = (x, y, maxRadius = 120) => {
    gravityWaves.push({ x, y, radius: 2, maxRadius, life: 1, speed: 2.5 })
  }

  const drawGravityWaves = () => {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = gravityWaves.length - 1; i >= 0; i--) {
      const w = gravityWaves[i]
      w.radius += w.speed
      w.life = 1 - w.radius / w.maxRadius
      if (w.life <= 0) { gravityWaves.splice(i, 1); continue }
      const alpha = w.life * 0.6
      const lineWidth = 1 + w.life * 2

      ctx.globalAlpha = alpha
      ctx.strokeStyle = `rgba(255, 200, 230, ${alpha})`
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2)
      ctx.stroke()

      if (w.radius > 15) {
        ctx.globalAlpha = alpha * 0.3
        ctx.strokeStyle = `rgba(255, 170, 220, ${alpha * 0.5})`
        ctx.lineWidth = lineWidth * 0.5
        ctx.beginPath()
        ctx.arc(w.x, w.y, w.radius * 0.6, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  const drawSineWave = (time, yOffset, amplitude, frequency, speed, baseAlpha, baseColor, highlightColor, displacements) => {
    const segmentLen = 4
    const barCount = displacements ? displacements.length : 0

    for (let x = 0; x < W; x += segmentLen) {
      const xEnd = Math.min(x + segmentLen, W)
      const phase1 = x * frequency + time * speed
      const phase2 = xEnd * frequency + time * speed

      let disp1 = 0, disp2 = 0
      if (displacements && barCount > 0) {
        const barIdx = Math.min(Math.floor((x / W) * barCount), barCount - 1)
        const barIdx2 = Math.min(Math.floor((xEnd / W) * barCount), barCount - 1)
        disp1 = displacements[barIdx] * 35
        disp2 = displacements[barIdx2] * 35
      }

      const y1 = yOffset + Math.sin(phase1) * amplitude + disp1
      const y2 = yOffset + Math.sin(phase2) * amplitude + disp2

      const midX = (x + xEnd) / 2
      const midY = (y1 + y2) / 2
      const dx = midX - smoothMouseX
      const dy = midY - smoothMouseY
      const dist = Math.sqrt(dx * dx + dy * dy)

      const hasPointer = smoothMouseX > -500
      const highlightRadius = 200

      let alpha, color, lineWidth

      if (hasPointer && dist < highlightRadius) {
        const proximity = 1 - dist / highlightRadius
        const eased = proximity * proximity
        alpha = baseAlpha + eased * 0.6
        color = eased > 0.3 ? highlightColor : baseColor
        lineWidth = 1.5 + eased * 2
      } else {
        alpha = baseAlpha
        color = baseColor
        lineWidth = 1.5
      }

      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.globalAlpha = alpha
ctx.globalCompositeOperation = 'screen'
      ctx.moveTo(x, y1)
      ctx.lineTo(xEnd, y2)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  let last = performance.now()
  let waveTime = 0
  let frameCount = 0
  let cachedBars = null

  const draw = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!reduced) waveTime += dt * 0.8
    frameCount++

    const lerp = reduced ? 1 : 0.12
    smoothMouseX += (mouseX - smoothMouseX) * lerp
    smoothMouseY += (mouseY - smoothMouseY) * lerp

    const gradLerp = reduced ? 1 : 0.04
    gradX += (mouseX - gradX) * gradLerp
    gradY += (mouseY - gradY) * gradLerp

    const hasPointer = smoothMouseX > -500
    if (hasPointer) {
      updateGradient(gradX, gradY)
    } else {
      if (hBloom) hBloom.style.transform = 'translateY(-2000px)'
    }

    // Pan offset: scroll + pointer influence
    const pointerPanX = hasPointer ? (smoothMouseX / W - 0.5) * 30 : 0
    const pointerPanY = hasPointer ? (smoothMouseY / H - 0.5) * 20 : 0
    const panX = scrollPanX + pointerPanX
    const panY = scrollPanY + pointerPanY

    // Compute pan-adjusted positions once per frame
    const rx = new Float32Array(stars.length)
    const ry = new Float32Array(stars.length)
    for (let i = 0; i < stars.length; i++) {
      rx[i] = stars[i].x + panX
      ry[i] = stars[i].y + panY
    }

    ctx.clearRect(0, 0, W, H)

    const waveY = H * 0.55
    drawSineWave(
      waveTime, waveY, 40, 0.012, 1.2,
      0.5,
      'rgba(255, 120, 180, 0.7)',
      'rgba(255, 180, 220, 1.0)',
      null
    )
    drawSineWave(
      waveTime + 1.5, waveY + 15, 30, 0.009, 0.5,
      0.4,
      'rgba(180, 140, 255, 0.6)',
      'rgba(200, 170, 255, 1.0)',
      cachedBars
    )

    // Draw stars with pan offsets
    for (let i = 0; i < stars.length; i++) {
      const px = rx[i]
      const py = ry[i]
      const dx = px - smoothMouseX
      const dy = py - smoothMouseY
      const dist = Math.sqrt(dx * dx + dy * dy)

      let alpha = stars[i].baseAlpha
      let flareAlpha = 0
      let sizeMult = 1

      if (hasPointer && dist < HIGHLIGHT_RADIUS) {
        const proximity = 1 - dist / HIGHLIGHT_RADIUS
        const eased = proximity * (2 - proximity)
        alpha = stars[i].baseAlpha + eased * 0.85
        sizeMult = 1 + eased * 3
        if (dist < FLARE_RADIUS) {
          flareAlpha = (1 - dist / FLARE_RADIUS) * 0.95
        }
      }

      ctx.globalAlpha = alpha
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(px, py, stars[i].size * sizeMult, 0, Math.PI * 2)
      ctx.fill()

      if (hasPointer && dist < HIGHLIGHT_RADIUS * 0.7) {
        const proximity = 1 - dist / (HIGHLIGHT_RADIUS * 0.7)
        const haloAlpha = proximity * 0.4
        const haloGrad = ctx.createRadialGradient(px, py, 0, px, py, stars[i].size * 6)
        haloGrad.addColorStop(0, `rgba(255, 200, 230, ${haloAlpha})`)
        haloGrad.addColorStop(1, 'rgba(255, 180, 220, 0)')
        ctx.fillStyle = haloGrad
        ctx.beginPath()
        ctx.arc(px, py, stars[i].size * 6, 0, Math.PI * 2)
        ctx.fill()
      }

if (flareAlpha > 0.05) {
          drawFlare(px, py, flareAlpha, stars[i].size * 6)
        }
    }
    // Emit a horizontal lens flare from the cursor radial gradient
    if (hasPointer) {
      drawFlare(gradX, gradY, 0.25, 30)
    }

    // Draw wireframe edges — each star connects to its NEAREST_K closest neighbors
    if (hasPointer) {
      const currentHighlighted = new Set()
      let mostProminentEdge = null
      let maxProximity = -1

      for (let i = 0; i < stars.length; i++) {
        // Find K nearest neighbors
        const dists = []
        for (let j = 0; j < stars.length; j++) {
          if (i === j) continue
          const ddx = rx[i] - rx[j]
          const ddy = ry[i] - ry[j]
          dists.push({ j, d: ddx * ddx + ddy * ddy })
        }
        dists.sort((a, b) => a.d - b.d)
        const neighbors = dists.slice(0, NEAREST_K)

        for (const { j, d } of neighbors) {
          const pairKey = i < j ? `${i}-${j}` : `${j}-${i}`
          if (currentHighlighted.has(pairKey)) continue
          currentHighlighted.add(pairKey)

          const midX = (rx[i] + rx[j]) / 2
          const midY = (ry[i] + ry[j]) / 2
          const midDx = midX - smoothMouseX
          const midDy = midY - smoothMouseY
          const midDist = Math.sqrt(midDx * midDx + midDy * midDy)

          const starDist = Math.min(
            Math.sqrt((rx[i] - smoothMouseX) ** 2 + (ry[i] - smoothMouseY) ** 2),
            Math.sqrt((rx[j] - smoothMouseX) ** 2 + (ry[j] - smoothMouseY) ** 2)
          )

          if (midDist > HIGHLIGHT_RADIUS && starDist > HIGHLIGHT_RADIUS) continue

          const proximity = midDist < HIGHLIGHT_RADIUS
            ? 1 - midDist / HIGHLIGHT_RADIUS
            : Math.max(0, 1 - starDist / HIGHLIGHT_RADIUS) * 0.5

          const eased = proximity * proximity
          ctx.globalAlpha = eased * 0.7
          ctx.lineWidth = 0.6 + eased * 1.8
          ctx.strokeStyle = `rgba(255, 200, 230, ${eased})`
          ctx.beginPath()
          ctx.moveTo(rx[i], ry[i])
          ctx.lineTo(rx[j], ry[j])
          ctx.stroke()

          if (eased > maxProximity) {
            maxProximity = eased
            mostProminentEdge = { x1: rx[i], y1: ry[i], x2: rx[j], y2: ry[j] }
          }
        }
      }

      // Emit particles from the most prominent edge
      if (mostProminentEdge && frameCount % 2 === 0) {
        spawnSparks(mostProminentEdge.x1, mostProminentEdge.y1, mostProminentEdge.x2, mostProminentEdge.y2, 8)
      }

      // Gravity waves on finished edges
      for (const oldKey of prevHighlightedEdges) {
        if (!currentHighlighted.has(oldKey)) {
          const parts = oldKey.split('-').map(Number)
          const si = parts[0], sj = parts[1]
          if (stars[si] && stars[sj]) {
            const mx = (rx[si] + rx[sj]) / 2
            const my = (ry[si] + ry[sj]) / 2
            spawnGravityWave(mx, my, 120)
          }
        }
      }
      prevHighlightedEdges = currentHighlighted
    } else {
      if (prevHighlightedEdges.size > 0) {
        for (const oldKey of prevHighlightedEdges) {
          const parts = oldKey.split('-').map(Number)
          const si = parts[0], sj = parts[1]
          if (stars[si] && stars[sj]) {
            const mx = (rx[si] + rx[sj]) / 2
            const my = (ry[si] + ry[sj]) / 2
            spawnGravityWave(mx, my, 80)
          }
        }
        prevHighlightedEdges.clear()
      }
    }

    drawSparks()
    drawGravityWaves()

    ctx.globalAlpha = 1
    requestAnimationFrame(draw)
  }

  resize()
  addEventListener('resize', () => { resize(); prevHighlightedEdges.clear() }, { passive: true })
  requestAnimationFrame(draw)
}

// ── Horizontal phase flash + chromatic halo on touch/pointer ──
//
// On pointerdown a horizontal "phase" beam converges to the pointer and a
// bright halo blooms around it. While the halo is held the area near the
// pointer visually glitches: large semi-transparent squares get offset and
// cyan / magenta channel layers separate horizontally. On release the halo
// dissolves by flashing two horizontal beams outward to both sides.
function applyPhaseFlash() {
  const canvas = document.getElementById('phase-flash')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  let dpr = 1
  let W = 0, H = 0
  const points = new Map() // pointerId -> phase point
  const ghosts = []        // released beams in their dissolve animation

  const ATTACK_MS  = 140   // beam-converge duration
  const RELEASE_MS = 320   // dual-direction dissolve duration

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = innerWidth
    H = innerHeight
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const press = (id, x, y) => {
    points.set(id, { x, y, born: performance.now(), released: false })
  }

  const move = (id, x, y) => {
    const p = points.get(id)
    if (p) { p.x = x; p.y = y }
  }

  const release = (id) => {
    const p = points.get(id)
    if (!p) return
    ghosts.push({ x: p.x, y: p.y, born: performance.now() })
    points.delete(id)
  }

  // Convergence beam: thin horizontal line peaking at pointer X, fading to edges.
  const drawConvergeBeam = (x, y, t /* 0..1 */) => {
    const reach = W * (0.5 + t * 0.5)
    const thickness = 1 + (1 - t) * 6
    const alpha = (1 - t) * 0.85
    const grad = ctx.createLinearGradient(x - reach, 0, x + reach, 0)
    grad.addColorStop(0,    'rgba(255, 80, 200, 0)')
    grad.addColorStop(0.45, `rgba(255, 80, 200, ${alpha * 0.4})`)
    grad.addColorStop(0.5,  `rgba(255, 255, 255, ${alpha})`)
    grad.addColorStop(0.55, `rgba(120, 220, 255, ${alpha * 0.4})`)
    grad.addColorStop(1,    'rgba(120, 220, 255, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - reach, y - thickness / 2, reach * 2, thickness)
  }

  // Bright halo bloom around the pointer.
  const drawHalo = (x, y, scale, alpha) => {
    const r = 60 + scale * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0,    `rgba(255, 255, 255, ${alpha * 0.85})`)
    g.addColorStop(0.25, `rgba(255, 120, 220, ${alpha * 0.55})`)
    g.addColorStop(0.6,  `rgba(120, 200, 255, ${alpha * 0.25})`)
    g.addColorStop(1,    'rgba(120, 200, 255, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Digital deform: large offset squares + cyan/magenta channel separation.
  const drawDeform = (x, y, alpha) => {
    if (alpha <= 0.01) return
    const radius = 180
    const blocks = 7
    for (let i = 0; i < blocks; i++) {
      const size = 28 + Math.random() * 90
      const ox = (Math.random() - 0.5) * radius * 1.6
      const oy = (Math.random() - 0.5) * radius * 1.0
      const shift = (12 + Math.random() * 28) * (Math.random() < 0.5 ? -1 : 1)
      const bx = x + ox - size / 2
      const by = y + oy - size / 2
      ctx.fillStyle = `rgba(0, 220, 255, ${alpha * 0.32})`
      ctx.fillRect(bx + shift, by, size, size)
      ctx.fillStyle = `rgba(255, 0, 200, ${alpha * 0.32})`
      ctx.fillRect(bx - shift, by, size, size)
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.06})`
      ctx.fillRect(bx, by, size, size)
    }
    // Two horizontal RGB-shift slices that ride through the pointer row.
    const slices = 2
    for (let i = 0; i < slices; i++) {
      const sliceY = y + (Math.random() - 0.5) * 80
      const h = 3 + Math.random() * 6
      const shift = (8 + Math.random() * 22) * (Math.random() < 0.5 ? -1 : 1)
      ctx.fillStyle = `rgba(0, 220, 255, ${alpha * 0.45})`
      ctx.fillRect(shift, sliceY, W, h)
      ctx.fillStyle = `rgba(255, 0, 200, ${alpha * 0.45})`
      ctx.fillRect(-shift, sliceY + 2, W, h)
    }
  }

  // Dissolve flash: two horizontal beams shooting left and right from the halo.
  const drawDissolve = (x, y, t /* 0..1 */) => {
    const reach = W * t
    const thickness = 2 + (1 - t) * 10
    const alpha = (1 - t) * 0.95
    // Left beam
    const gL = ctx.createLinearGradient(x - reach, 0, x, 0)
    gL.addColorStop(0,   'rgba(120, 220, 255, 0)')
    gL.addColorStop(0.8, `rgba(120, 220, 255, ${alpha * 0.5})`)
    gL.addColorStop(1,   `rgba(255, 255, 255, ${alpha})`)
    ctx.fillStyle = gL
    ctx.fillRect(x - reach, y - thickness / 2, reach, thickness)
    // Right beam
    const gR = ctx.createLinearGradient(x, 0, x + reach, 0)
    gR.addColorStop(0,   `rgba(255, 255, 255, ${alpha})`)
    gR.addColorStop(0.2, `rgba(255, 120, 220, ${alpha * 0.5})`)
    gR.addColorStop(1,   'rgba(255, 120, 220, 0)')
    ctx.fillStyle = gR
    ctx.fillRect(x, y - thickness / 2, reach, thickness)
    // Shrinking residual halo
    drawHalo(x, y, 1 - t, (1 - t) * 0.4)
  }

  const draw = (now) => {
    requestAnimationFrame(draw)
    ctx.clearRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'

    // Active (held) phase points: attack ramp → sustain (held halo + deform).
    for (const p of points.values()) {
      const age = now - p.born
      const attack = Math.min(1, age / ATTACK_MS)
      // Beam converges during attack only.
      if (attack < 1) drawConvergeBeam(p.x, p.y, attack)
      const sustain = reduced ? attack : attack * (0.85 + 0.15 * Math.sin(now / 90))
      drawHalo(p.x, p.y, sustain, sustain * 0.95)
      drawDeform(p.x, p.y, sustain)
    }

    // Released phase points: dissolve outward, then drop.
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]
      const t = Math.min(1, (now - g.born) / RELEASE_MS)
      drawDissolve(g.x, g.y, t)
      if (t >= 1) ghosts.splice(i, 1)
    }
  }

  resize()
  addEventListener('resize', resize, { passive: true })

  // Pointer + touch lifecycle. Use the pointer events for unified handling
  // and fall back to touch events on environments that don't dispatch
  // PointerEvents on touch (older iOS Safari).
  addEventListener('pointerdown',   (e) => press(e.pointerId, e.clientX, e.clientY), { passive: true })
  addEventListener('pointermove',   (e) => move(e.pointerId, e.clientX, e.clientY),  { passive: true })
  addEventListener('pointerup',     (e) => release(e.pointerId), { passive: true })
  addEventListener('pointercancel', (e) => release(e.pointerId), { passive: true })
  addEventListener('pointerleave',  (e) => release(e.pointerId), { passive: true })

  addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) press(`t${t.identifier}`, t.clientX, t.clientY)
  }, { passive: true })
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) move(`t${t.identifier}`, t.clientX, t.clientY)
  }, { passive: true })
  addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) release(`t${t.identifier}`)
  }, { passive: true })
  addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) release(`t${t.identifier}`)
  }, { passive: true })

  requestAnimationFrame(draw)
}

// ── Full-page glitch overlay ──
function applyGlitchEffect() {
  const canvas = document.getElementById('glitch-overlay')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  // const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  // if (reduced) return

  let dpr = 1, W = 0, H = 0
  let cursorX = -1000, cursorY = -1000
  let smoothX = -1000, smoothY = -1000
  let glitchTime = 0

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    W = innerWidth
    H = innerHeight
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  addEventListener('pointermove', (e) => {
    cursorX = e.clientX
    cursorY = e.clientY
  }, { passive: true })
  addEventListener('pointerleave', () => { cursorX = -1000; cursorY = -1000 }, { passive: true })

  const drawScanlines = (intensity) => {
    ctx.globalAlpha = intensity * 0.15
    ctx.fillStyle = '#000'
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 1)
    }
  }

  const drawColorBlocks = (intensity) => {
    const count = Math.floor(intensity * 30)
    const colors = [
      `rgba(255, 0, 60, ${intensity * 0.4})`,
      `rgba(0, 200, 255, ${intensity * 0.3})`,
      `rgba(255, 255, 0, ${intensity * 0.2})`,
    ]
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
      const x = Math.random() * W
      const y = Math.random() * H
      const w = 20 + Math.random() * 80 * intensity
      const h = 1 + Math.random() * 4
      ctx.fillRect(x, y, w, h)
    }
  }

  const drawFragmentation = (intensity, cy) => {
    if (intensity < 0.02) return
    const count = Math.floor(intensity * 15)
    for (let i = 0; i < count; i++) {
      const y = cy + (Math.random() - 0.5) * 300
      const h = 1 + Math.random() * 3
      const shift = (Math.random() - 0.5) * 80 * intensity
      ctx.fillStyle = `rgba(255, 220, 240, ${intensity * 0.3})`
      ctx.fillRect(shift, y, W, h)
      ctx.fillStyle = `rgba(100, 200, 255, ${intensity * 0.2})`
      ctx.fillRect(shift * 0.5, y + 2, W, h)
    }
  }

  const drawDigitalNoise = (intensity) => {
    const count = Math.floor(intensity * 200)
    ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.15})`
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const s = 1 + Math.random() * 2
      ctx.fillRect(x, y, s, s)
    }
  }

  let frame = 0
  const render = () => {
    requestAnimationFrame(render)
    frame++
    if (frame % 2 !== 0) return

    const dt = 0.016
    glitchTime += dt

    smoothX += (cursorX - smoothX) * 0.08
    smoothY += (cursorY - smoothY) * 0.08

    const hasCursor = cursorY > -500

    const pulse = Math.sin(glitchTime * 0.7) * 0.5 + 0.5
    const randomJitter = Math.random() * 0.015
    let baseIntensity = 0.008 + pulse * 0.012 + randomJitter

    let cursorBoost = 0
    if (hasCursor) {
      const yDist = Math.abs(smoothY - cursorY)
      const xFactor = Math.max(0, 1 - Math.abs(smoothX - W / 2) / (W * 0.6))
      cursorBoost = Math.max(0, 1 - yDist / 500) * xFactor * 0.08
    }

    const intensity = baseIntensity + cursorBoost

    ctx.clearRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 1

    if (intensity > 0.005) {
      drawScanlines(intensity)
      drawColorBlocks(intensity)
      drawDigitalNoise(intensity)
      if (hasCursor && cursorBoost > 0.01) {
        drawFragmentation(cursorBoost, smoothY)
      }
    }
  }

  resize()
  addEventListener('resize', resize, { passive: true })
  requestAnimationFrame(render)
}


let observer;

function main () {

  // ── IntersectionObserver for scroll-triggered animations ──
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        const el = entry.target
        el.classList.toggle('visible', entry.isIntersecting)
        if (entry.isIntersecting && el.querySelector('.typewriter-line') && !el.dataset.typewriterDone) {
          typeText(el)
          el.dataset.typewriterDone = 'true'
        }
      })
    },
    { threshold: 0.15 }
  )

  document.querySelectorAll('#features .fade-blur, #features .feature-card, #download .fade-blur, #player .fade-blur, #library .fade-blur, .typewriter-line').forEach(el => {
    observer.observe(el)
  })

  // ── Nav dot active state ──
  const sections = document.querySelectorAll('.scroll-section')
  const dots = document.querySelectorAll('.nav-dot')

  const dotObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id
          dots.forEach(d => d.classList.toggle('active', d.getAttribute('href') === `#${id}`))
        }
      })
    },
    { threshold: 0.5 }
  )

  sections.forEach(s => dotObserver.observe(s))

  typeText()
  renderGallery()
  applyLighting()
  drawEffects()
  applyGlitchEffect()
  applyPhaseFlash()

  // ── Parallax scroll for hero background elements ──
  const heroSection = document.getElementById('hero')
  const heroGradient = heroSection?.querySelector('.hero-gradient-overlay')
  const heroCanvas = document.getElementById('hero-canvas')

  const scrollContainer = document.querySelector('.scroll-container')
  if (scrollContainer && heroSection) {
    scrollContainer.addEventListener('scroll', () => {
      const scrollY = scrollContainer.scrollTop
      const heroH = heroSection.offsetHeight
      if (scrollY <= heroH) {
        const offset = scrollY * 0.35
        const scale = 1 + scrollY / heroH * 0.08
        const parallaxStyle = `translateY(${offset}px) scale(${scale})`
        if (heroGradient) heroGradient.style.transform = parallaxStyle
        if (heroCanvas) heroCanvas.style.transform = parallaxStyle
        scrollPanX = -(scrollY / heroH) * 40
        scrollPanY = -(scrollY / heroH) * 25
      }
    }, { passive: true })
  }

  // ── Generate waveform bars ──
  const waveformContainer = document.querySelector('.hero-waveform')
  if (waveformContainer) {
    const barCount = 60
    for (let i = 0; i < barCount; i++) {
      const bar = document.createElement('span')
      bar.className = 'bar'
      const h = 20 + Math.sin(i / barCount * Math.PI * 6) * 40 + Math.random() * 30
      bar.style.setProperty('--h', `${h}%`)
      bar.style.animationDelay = `${i * 0.05}s`
      waveformContainer.appendChild(bar)
    }
  }
}

main()