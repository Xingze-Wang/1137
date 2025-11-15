// Landing Page JavaScript - Performance Optimized

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // Intersection Observer for scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe all feature cards and sections
  document.querySelectorAll('.feature-card, .step, .section-header').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(el);
  });

  // Add animate-in class styles dynamically
  const style = document.createElement('style');
  style.textContent = `
    .animate-in {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;
  document.head.appendChild(style);

  // Smooth scroll for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        const offset = 80; // Navigation height
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // Dynamic typing effect for hero title
  const titleGradient = document.querySelector('.title-gradient');
  if (titleGradient) {
    const originalText = titleGradient.textContent;
    titleGradient.textContent = '';
    let index = 0;

    const typeEffect = () => {
      if (index < originalText.length) {
        titleGradient.textContent += originalText.charAt(index);
        index++;
        setTimeout(typeEffect, 50);
      }
    };

    // Start typing after a short delay
    setTimeout(typeEffect, 500);
  }

  // Parallax effect for gradient orbs
  let ticking = false;
  function updateParallax() {
    const scrolled = window.pageYOffset;
    const orb1 = document.querySelector('.orb-1');
    const orb2 = document.querySelector('.orb-2');
    const orb3 = document.querySelector('.orb-3');

    if (orb1) orb1.style.transform = `translate(${scrolled * 0.1}px, ${scrolled * 0.15}px)`;
    if (orb2) orb2.style.transform = `translate(${-scrolled * 0.05}px, ${scrolled * 0.1}px)`;
    if (orb3) orb3.style.transform = `translate(${scrolled * 0.08}px, ${-scrolled * 0.05}px)`;

    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      window.requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  // Throttle scroll event for performance
  window.addEventListener('scroll', requestTick, { passive: true });

  // Add hover effect to prompt cards
  const promptCards = document.querySelectorAll('.prompt-card');
  promptCards.forEach(card => {
    card.addEventListener('click', function() {
      const mode = this.dataset.mode;
      const prompt = this.dataset.prompt;

      // Store in sessionStorage for the main app
      sessionStorage.setItem('selectedMode', mode);
      sessionStorage.setItem('initialPrompt', prompt);

      // Navigate to main app
      window.location.href = 'index.html';
    });
  });

  // Animated counter for stats
  const animateValue = (element, start, end, duration) => {
    const startTimestamp = Date.now();
    const step = () => {
      const timestamp = Date.now();
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const value = Math.floor(progress * (end - start) + start);

      if (element.textContent.includes('+')) {
        element.textContent = value.toLocaleString() + '+';
      } else if (element.textContent.includes('%')) {
        element.textContent = value + '%';
      } else {
        element.textContent = value.toLocaleString() + '+';
      }

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  };

  // Trigger counter animation when stats section is visible
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const statNumbers = entry.target.querySelectorAll('.stat-number');
        statNumbers.forEach(stat => {
          const text = stat.textContent;
          let endValue = 0;

          if (text.includes('10K+')) {
            endValue = 10000;
          } else if (text.includes('1M+')) {
            endValue = 1000000;
          } else if (text.includes('98%')) {
            endValue = 98;
          }

          if (endValue > 0) {
            animateValue(stat, 0, endValue, 2000);
          }
        });
        statsObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  const heroStats = document.querySelector('.hero-stats');
  if (heroStats) {
    statsObserver.observe(heroStats);
  }

  // Navigation scroll effect
  let lastScroll = 0;
  const nav = document.querySelector('.nav');

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
      nav.classList.add('nav-scrolled');
    } else {
      nav.classList.remove('nav-scrolled');
    }

    lastScroll = currentScroll;
  }, { passive: true });

  // Add nav-scrolled styles
  const navStyle = document.createElement('style');
  navStyle.textContent = `
    .nav.nav-scrolled {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      background: rgba(255, 255, 255, 0.98);
    }
  `;
  document.head.appendChild(navStyle);

  // Preload critical images for better performance
  const preloadImages = () => {
    const imagesToPreload = [
      // Add any critical image URLs here
    ];

    imagesToPreload.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  };

  preloadImages();

  // Lazy load non-critical resources
  if ('IntersectionObserver' in window) {
    const lazyElements = document.querySelectorAll('[data-lazy]');
    const lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target;
          // Load lazy content here
          lazyObserver.unobserve(element);
        }
      });
    });

    lazyElements.forEach(element => {
      lazyObserver.observe(element);
    });
  }

  // Performance monitoring
  if (window.performance && window.performance.timing) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const timing = window.performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        console.log(`Page load time: ${loadTime}ms`);

        // Send to analytics if needed
        if (loadTime > 3000) {
          console.warn('Page load time is above 3 seconds. Consider optimization.');
        }
      }, 0);
    });
  }
});