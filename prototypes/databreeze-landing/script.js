(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('[data-header]');
  const revealItems = document.querySelectorAll('[data-reveal]');
  const counterItems = document.querySelectorAll('[data-counter]');
  const flowStage = document.querySelector('[data-flow-stage]');
  const productScene = document.querySelector('[data-product-scene]');
  const tiltTarget = document.querySelector('[data-tilt]');
  const cursorAura = document.querySelector('.cursor-aura');
  const heroCanvas = document.querySelector('[data-data-canvas]');
  const closingCanvas = document.querySelector('[data-closing-canvas]');
  const sectionTransitions = [...document.querySelectorAll('[data-section-transition]')];
  const hoverSections = [
    ...document.querySelectorAll('main > section, main > .section-transition, main > .signal-band'),
  ];
  const motionRegions = [...hoverSections];

  let latestPointerX = window.innerWidth / 2;
  let latestPointerY = window.innerHeight / 2;
  let activeHoverSection = null;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const formatCounter = (value, suffix = '') => {
    if (suffix === '%') {
      return `${value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }

    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ ₫`;
    }

    return Math.round(value).toLocaleString('vi-VN');
  };

  const animateCounter = (element) => {
    if (element.dataset.counted === 'true') return;
    element.dataset.counted = 'true';

    const target = Number(element.dataset.counter ?? 0);
    const suffix = element.dataset.suffix ?? '';
    const duration = reducedMotion ? 1 : 1300;
    const start = performance.now();

    const update = (now) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatCounter(target * eased, suffix);
      if (progress < 1) requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  };

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        entry.target.querySelectorAll?.('[data-counter]').forEach(animateCounter);
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.14 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));

  // Hash navigation can move an entire section into the viewport in one
  // frame. Make that destination readable immediately instead of waiting for
  // an intersection update that some browsers skip after a smooth jump.
  const revealHashTarget = (hash) => {
    if (!hash || hash === '#') return;
    const target = document.getElementById(hash.slice(1));
    target?.querySelectorAll('[data-reveal]').forEach((item) => {
      item.classList.add('is-visible');
    });
  };

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href^="#"]');
    revealHashTarget(anchor?.getAttribute('href'));
  });
  window.addEventListener('hashchange', () => revealHashTarget(window.location.hash));
  revealHashTarget(window.location.hash);

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.55 },
  );

  counterItems.forEach((item) => counterObserver.observe(item));

  if (!reducedMotion) {
    const motionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-motion-active', entry.isIntersecting);
        });
      },
      { rootMargin: '18% 0px 18% 0px' },
    );

    motionRegions.forEach((region) => {
      region.classList.add('motion-region');
      motionObserver.observe(region);
    });
  }

  const updateScrollEffects = () => {
    const scrollY = window.scrollY;
    header?.classList.toggle('scrolled', scrollY > 24);

    if (flowStage) {
      const rect = flowStage.getBoundingClientRect();
      const progress = clamp((window.innerHeight * 0.62 - rect.top) / rect.height, 0, 1);
      flowStage.style.setProperty('--flow-progress', `${progress * 100}%`);
    }

    if (productScene && !reducedMotion) {
      const progress = clamp(scrollY / 760, 0, 1);
      productScene.style.transform = `translateX(-50%) translateY(${progress * 24}px) scale(${1 - progress * 0.035})`;
    }

    if (!reducedMotion) {
      sectionTransitions.forEach((transition) => {
        const rect = transition.getBoundingClientRect();
        const travel = window.innerHeight + rect.height;
        const progress = clamp((window.innerHeight - rect.top) / travel, 0, 1);
        transition.style.setProperty('--transition-progress', progress.toFixed(4));
        transition.style.setProperty('--transition-reveal', `${(1 - progress) * 100}%`);
        transition.style.setProperty('--transition-radius', `${progress * 112}%`);
        transition.style.setProperty('--transition-line-scale', String(0.15 + progress * 0.85));
        transition.style.setProperty('--transition-axis-scale', String(0.25 + progress * 0.75));
        transition.style.setProperty('--transition-core-scale', String(0.86 + progress * 0.14));
        transition.style.setProperty('--aperture-outer-scale', String(0.72 + progress * 0.28));
        transition.style.setProperty('--aperture-mid-scale', String(0.65 + progress * 0.35));
        transition.style.setProperty('--aperture-inner-scale', String(0.55 + progress * 0.45));
        transition.style.setProperty('--aperture-outer-rotation', `${progress * 115}deg`);
        transition.style.setProperty('--aperture-mid-rotation', `${progress * -160}deg`);
        transition.style.setProperty('--aperture-inner-rotation', `${progress * 220}deg`);
        transition.style.setProperty('--aperture-grid-rotation', `${progress * 7}deg`);
        transition.style.setProperty('--proof-rail-y', `${progress * 510 - 80}px`);
        transition.style.setProperty('--proof-rail-y-inverse', `${(1 - progress) * 510 - 80}px`);
        transition.style.setProperty('--proof-word-scale', String(0.84 + progress * 0.16));
        transition.style.setProperty('--proof-word-opacity', String(0.18 + progress * 0.62));
        transition.style.setProperty('--iris-outer-rotation', `${progress * 125}deg`);
        transition.style.setProperty('--iris-inner-rotation', `${progress * -180}deg`);
        transition.style.setProperty('--iris-core-scale', String(0.72 + progress * 0.28));
        transition.classList.toggle('is-active', progress > 0.06 && progress < 0.94);
      });
    }
  };

  let scrollFrame = null;
  const scheduleScrollEffects = () => {
    if (activeHoverSection) {
      activeHoverSection.classList.remove('pointer-inside');
      activeHoverSection = null;
    }
    if (cursorAura) cursorAura.style.opacity = '0';
    if (scrollFrame !== null) return;
    scrollFrame = window.requestAnimationFrame(() => {
      updateScrollEffects();
      scrollFrame = null;
    });
  };

  window.addEventListener('scroll', scheduleScrollEffects, { passive: true });
  window.addEventListener('resize', scheduleScrollEffects, { passive: true });
  updateScrollEffects();

  window.addEventListener(
    'pointermove',
    (event) => {
      latestPointerX = event.clientX;
      latestPointerY = event.clientY;
      if (cursorAura) cursorAura.style.opacity = '1';
      document.documentElement.style.setProperty('--cursor-x', `${latestPointerX}px`);
      document.documentElement.style.setProperty('--cursor-y', `${latestPointerY}px`);
    },
    { passive: true },
  );

  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    hoverSections.forEach((section) => {
      const field = document.createElement('div');
      field.className = 'section-hover-field';
      field.setAttribute('aria-hidden', 'true');
      section.prepend(field);
      section.classList.add('has-hover-field');

      if (
        section.classList.contains('evidence-section') ||
        section.classList.contains('pricing-section') ||
        section.classList.contains('feedback-section') ||
        section.classList.contains('transition-iris')
      ) {
        section.classList.add('hover-light');
      }

      section.addEventListener(
        'pointermove',
        (event) => {
          const rect = section.getBoundingClientRect();
          section.style.setProperty('--section-hover-x', `${event.clientX - rect.left}px`);
          section.style.setProperty('--section-hover-y', `${event.clientY - rect.top}px`);
          if (activeHoverSection && activeHoverSection !== section) {
            activeHoverSection.classList.remove('pointer-inside');
          }
          activeHoverSection = section;
          section.classList.add('pointer-inside');
        },
        { passive: true },
      );

      section.addEventListener('pointerleave', () => {
        section.classList.remove('pointer-inside');
        if (activeHoverSection === section) activeHoverSection = null;
      });
    });

    const interactiveSurfaces = document.querySelectorAll(
      '.metric-card, .chart-panel, .agent-panel, .flow-visual, .reasoning-node, .lineage-node, .mode-visual, .pricing-card, .feedback-form',
    );

    interactiveSurfaces.forEach((surface) => {
      const glow = document.createElement('span');
      glow.className = 'surface-glow';
      glow.setAttribute('aria-hidden', 'true');
      surface.prepend(glow);
      surface.classList.add('interactive-surface');

      surface.addEventListener(
        'pointermove',
        (event) => {
          const rect = surface.getBoundingClientRect();
          surface.style.setProperty('--surface-x', `${event.clientX - rect.left}px`);
          surface.style.setProperty('--surface-y', `${event.clientY - rect.top}px`);
        },
        { passive: true },
      );
    });
  }

  if (tiltTarget && !reducedMotion && window.matchMedia('(pointer: fine)').matches) {
    tiltTarget.addEventListener('pointermove', (event) => {
      const rect = tiltTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      tiltTarget.style.transform = `rotateX(${5 - y * 3.5}deg) rotateY(${x * 4.5}deg)`;
    });

    tiltTarget.addEventListener('pointerleave', () => {
      tiltTarget.style.transform = 'rotateX(5deg) rotateY(0deg)';
    });
  }

  document.querySelectorAll('.magnetic').forEach((button) => {
    if (reducedMotion || !window.matchMedia('(pointer: fine)').matches) return;

    button.addEventListener('pointermove', (event) => {
      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * 0.12;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.16;
      button.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });

    button.addEventListener('pointerleave', () => {
      button.style.transform = '';
    });
  });

  const promptExperience = document.querySelector('[data-prompt-experience]');
  const runPromptButton = document.querySelector('[data-run-prompt]');
  const reasoningNodes = [...document.querySelectorAll('[data-reasoning-node]')];
  const processTime = document.querySelector('[data-process-time]');
  let promptRunId = 0;

  const runPromptDemo = () => {
    promptRunId += 1;
    const currentRun = promptRunId;
    promptExperience?.classList.add('running');
    reasoningNodes.forEach((node) => node.classList.remove('active', 'complete'));
    if (processTime) processTime.textContent = 'Đang xử lý…';

    reasoningNodes.forEach((node, index) => {
      window.setTimeout(
        () => {
          if (currentRun !== promptRunId) return;
          reasoningNodes.forEach((item, itemIndex) => {
            item.classList.toggle('complete', itemIndex < index);
            item.classList.toggle('active', itemIndex === index);
          });

          if (index === reasoningNodes.length - 1) {
            window.setTimeout(
              () => {
                if (currentRun !== promptRunId) return;
                node.classList.remove('active');
                node.classList.add('complete');
                promptExperience?.classList.remove('running');
                if (processTime) processTime.textContent = '1,84 giây';
              },
              reducedMotion ? 1 : 700,
            );
          }
        },
        reducedMotion ? index : index * 720,
      );
    });
  };

  runPromptButton?.addEventListener('click', runPromptDemo);

  const promptObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        runPromptDemo();
        promptObserver.disconnect();
      }
    },
    { threshold: 0.55 },
  );

  if (promptExperience) promptObserver.observe(promptExperience);

  const modeContent = {
    local: {
      label: 'LOCAL · RIÊNG TƯ TỐI ĐA',
      title: 'Giữ mọi thứ trên thiết bị tin cậy.',
      description:
        'Original và xử lý ở lại Desktop. Cloud chỉ nhận metadata an toàn theo chính sách.',
      stat: '0 B',
      projection: '0 B',
      accent: '#6075ff',
      index: 0,
    },
    hybrid: {
      label: 'HYBRID · MẶC ĐỊNH',
      title: 'Dữ liệu gốc ở lại. Insight đi cùng bạn.',
      description:
        'Xử lý file nhạy cảm trên Desktop, chỉ đồng bộ projection đã xem trước lên Web và Android.',
      stat: '0 B',
      projection: '2,4 MB',
      accent: '#8d9bff',
      index: 1,
    },
    cloud: {
      label: 'CLOUD · CỘNG TÁC TOÀN DIỆN',
      title: 'Một workspace luôn sẵn sàng ở mọi nơi.',
      description:
        'Thu nhận, chuẩn hóa, phân tích và xuất bản trong cloud với quyền truy cập được kiểm soát.',
      stat: 'Đã duyệt',
      projection: 'Toàn bộ workspace',
      accent: '#7138ff',
      index: 2,
    },
  };

  const modeSwitcher = document.querySelector('[data-mode-switcher]');
  const modeStage = document.querySelector('[data-mode-stage]');
  const modeButtons = [...document.querySelectorAll('[data-mode]')];
  const modeLabel = document.querySelector('[data-mode-label]');
  const modeTitle = document.querySelector('[data-mode-title]');
  const modeDescription = document.querySelector('[data-mode-description]');
  const modeStat = document.querySelector('[data-mode-stat]');
  const modeProjection = document.querySelector('[data-mode-projection]');

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      const content = modeContent[mode];
      if (!content || !modeSwitcher || !modeStage) return;

      modeButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });

      modeSwitcher.style.setProperty('--segment-index', `${content.index * 100}%`);
      modeSwitcher.style.setProperty('--periwinkle', content.accent);
      modeStage.dataset.modeStage = mode;
      if (modeLabel) modeLabel.textContent = content.label;
      if (modeTitle) modeTitle.textContent = content.title;
      if (modeDescription) modeDescription.textContent = content.description;
      if (modeStat) modeStat.textContent = content.stat;
      if (modeProjection) modeProjection.textContent = content.projection;
    });
  });

  const pricingSection = document.querySelector('[data-pricing-section]');
  const pricingCycleControl = document.querySelector('[data-pricing-cycle-control]');
  const pricingCycleButtons = [...document.querySelectorAll('[data-pricing-cycle]')];
  const pricingStatus = document.querySelector('[data-pricing-status]');
  const pricingLocale = pricingSection?.dataset.pricingLocale === 'en' ? 'en-US' : 'vi-VN';

  const formatPricingAmount = (value) => `${new Intl.NumberFormat(pricingLocale).format(value)} ₫`;

  pricingCycleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const cycle = button.dataset.pricingCycle;
      if (cycle !== 'monthly' && cycle !== 'annual') return;

      pricingCycleButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });

      pricingCycleControl?.style.setProperty(
        '--pricing-cycle-index',
        cycle === 'annual' ? '1' : '0',
      );
      document.querySelectorAll('[data-pricing-amount]').forEach((amount) => {
        const value = Number(amount.dataset[cycle]);
        if (Number.isFinite(value)) amount.textContent = formatPricingAmount(value);
      });
      document.querySelectorAll('[data-pricing-suffix]').forEach((suffix) => {
        suffix.textContent = suffix.dataset[`${cycle}Suffix`] ?? '';
      });
      document.querySelectorAll('[data-pricing-detail]').forEach((detail) => {
        detail.textContent = detail.dataset[`${cycle}Detail`] ?? '';
      });
      if (pricingStatus) {
        pricingStatus.textContent =
          pricingLocale === 'en-US'
            ? `Showing ${cycle === 'annual' ? 'annual' : 'monthly'} prices.`
            : `Đang hiển thị giá theo ${cycle === 'annual' ? 'năm' : 'tháng'}.`;
      }
    });
  });

  const feedbackForm = document.querySelector('[data-feedback-form]');
  const feedbackMessage = document.querySelector('[data-feedback-message]');
  const characterCount = document.querySelector('[data-character-count]');
  const feedbackStatus = document.querySelector('[data-feedback-status]');
  const feedbackSubmit = document.querySelector('[data-feedback-submit]');
  const formStatusMark = feedbackForm?.querySelector('.form-status-mark');

  const updateCharacterCount = () => {
    if (!feedbackMessage || !characterCount) return;
    characterCount.textContent = String(feedbackMessage.value.length);
  };

  feedbackMessage?.addEventListener('input', updateCharacterCount);
  updateCharacterCount();

  feedbackForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    feedbackForm.classList.add('was-validated');
    feedbackStatus?.classList.remove('error', 'success');

    if (!feedbackForm.checkValidity()) {
      if (feedbackStatus) {
        feedbackStatus.textContent = 'Vui lòng hoàn thành các trường bắt buộc trước khi gửi.';
        feedbackStatus.classList.add('error');
      }
      feedbackForm.reportValidity();
      return;
    }

    if (feedbackSubmit) feedbackSubmit.disabled = true;
    if (feedbackStatus) feedbackStatus.textContent = 'Đang kiểm tra nội dung…';

    window.setTimeout(
      () => {
        if (feedbackSubmit) feedbackSubmit.disabled = false;
        if (feedbackStatus) {
          feedbackStatus.textContent =
            'Nội dung hợp lệ. Đây là bản prototype nên góp ý chưa được gửi hoặc lưu ra máy chủ.';
          feedbackStatus.classList.add('success');
        }
        if (formStatusMark) formStatusMark.innerHTML = '<i></i>Đã kiểm tra';
      },
      reducedMotion ? 1 : 520,
    );
  });

  class ParticleField {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.context = canvas?.getContext('2d');
      this.options = {
        count: options.count ?? 72,
        connectionDistance: options.connectionDistance ?? 135,
        pointerRadius: options.pointerRadius ?? 180,
        color: options.color ?? '141, 155, 255',
        speed: options.speed ?? 0.18,
      };
      this.particles = [];
      this.width = 0;
      this.height = 0;
      this.pixelRatio = 1;
      this.frame = null;
      this.isVisible = true;

      if (!this.context || !this.canvas) return;
      this.resize();
      this.createParticles();
      this.observe();
      window.addEventListener('resize', () => this.resize(), { passive: true });
      this.render();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      this.width = rect.width;
      this.height = rect.height;
      this.canvas.width = this.width * this.pixelRatio;
      this.canvas.height = this.height * this.pixelRatio;
      this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }

    createParticles() {
      const count = Math.min(this.options.count, Math.floor(this.width / 12));
      this.particles = Array.from({ length: count }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * this.options.speed,
        vy: (Math.random() - 0.5) * this.options.speed,
        radius: Math.random() * 1.4 + 0.5,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    observe() {
      const observer = new IntersectionObserver((entries) => {
        const nextVisible = entries[0]?.isIntersecting ?? true;
        if (nextVisible === this.isVisible) return;
        this.isVisible = nextVisible;

        if (!this.isVisible && this.frame !== null) {
          cancelAnimationFrame(this.frame);
          this.frame = null;
        } else if (this.isVisible && this.frame === null) {
          this.render();
        }
      });
      observer.observe(this.canvas);
    }

    render = () => {
      if (!this.context) return;
      if (!this.isVisible) {
        this.frame = null;
        return;
      }

      this.context.clearRect(0, 0, this.width, this.height);

      const canvasRect = this.canvas.getBoundingClientRect();
      const pointerX = latestPointerX - canvasRect.left;
      const pointerY = latestPointerY - canvasRect.top;
      const connectionDistanceSquared = this.options.connectionDistance ** 2;

      this.particles.forEach((particle, index) => {
        if (!reducedMotion) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.phase += 0.012;
        }

        if (particle.x < -10) particle.x = this.width + 10;
        if (particle.x > this.width + 10) particle.x = -10;
        if (particle.y < -10) particle.y = this.height + 10;
        if (particle.y > this.height + 10) particle.y = -10;

        for (let otherIndex = index + 1; otherIndex < this.particles.length; otherIndex += 1) {
          const other = this.particles[otherIndex];
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < connectionDistanceSquared) {
            const distance = Math.sqrt(distanceSquared);
            const alpha = (1 - distance / this.options.connectionDistance) * 0.11;
            this.context.beginPath();
            this.context.moveTo(particle.x, particle.y);
            this.context.lineTo(other.x, other.y);
            this.context.strokeStyle = `rgba(${this.options.color}, ${alpha})`;
            this.context.lineWidth = 0.7;
            this.context.stroke();
          }
        }

        const pointerDistance = Math.hypot(particle.x - pointerX, particle.y - pointerY);
        if (pointerDistance < this.options.pointerRadius) {
          const pointerAlpha = (1 - pointerDistance / this.options.pointerRadius) * 0.36;
          this.context.beginPath();
          this.context.moveTo(particle.x, particle.y);
          this.context.lineTo(pointerX, pointerY);
          this.context.strokeStyle = `rgba(${this.options.color}, ${pointerAlpha})`;
          this.context.lineWidth = 0.8;
          this.context.stroke();
        }

        this.context.beginPath();
        this.context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        this.context.fillStyle = `rgba(${this.options.color}, ${0.28 + Math.sin(particle.phase) * 0.15})`;
        this.context.fill();
      });

      this.frame = requestAnimationFrame(this.render);
    };
  }

  new ParticleField(heroCanvas, {
    count: 92,
    connectionDistance: 145,
    pointerRadius: 210,
    color: '141, 155, 255',
    speed: 0.21,
  });

  new ParticleField(closingCanvas, {
    count: 54,
    connectionDistance: 125,
    pointerRadius: 180,
    color: '96, 117, 255',
    speed: 0.14,
  });

  window.addEventListener('blur', () => {
    if (cursorAura) cursorAura.style.opacity = '0';
  });

  window.addEventListener('focus', () => {
    if (cursorAura) cursorAura.style.opacity = '1';
  });
})();
