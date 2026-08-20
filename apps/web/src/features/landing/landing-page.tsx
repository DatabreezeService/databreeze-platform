import { useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import teammateLandingHtml from '../../../../../prototypes/databreeze-landing/index.html?raw';
import { prepareTeammateLandingMarkup } from './landing-markup.ts';
import {
  createLandingFeedbackApi,
  type LandingFeedbackCategory,
  type LandingFeedbackExperience,
  type LandingFeedbackRole,
  type LandingFeedbackSubmission,
} from './landing-feedback-api.ts';
import './landing-host.css';

const TEAMMATE_LANDING_STYLESHEET = '/landing/styles.css';
const TEAMMATE_LANDING_SCRIPT = '/landing/script.js';

const FEEDBACK_COPY = {
  'vi-VN': {
    sending: 'Đang gửi góp ý…',
    sent: 'Cảm ơn bạn! Góp ý đã được ghi nhận trên máy chủ.',
    sentMark: 'Đã gửi',
    rateLimited: 'Bạn đã gửi quá nhiều góp ý trong thời gian ngắn. Vui lòng thử lại sau.',
    invalid: 'Nội dung góp ý chưa hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc.',
    failed: 'Chưa gửi được góp ý. Vui lòng thử lại.',
  },
  en: {
    sending: 'Sending feedback…',
    sent: 'Thank you! Your feedback has been recorded on the server.',
    sentMark: 'Sent',
    rateLimited: 'Too many feedback submissions were sent. Please try again later.',
    invalid: 'The feedback content is not valid. Please review the required fields.',
    failed: 'Feedback could not be sent. Please try again.',
  },
} as const;

function readFeedbackSubmission(form: HTMLFormElement): LandingFeedbackSubmission | undefined {
  const data = new FormData(form);
  const email = typeof data.get('email') === 'string' ? (data.get('email') as string).trim() : '';
  const role = data.get('role');
  const experience = data.get('experience');
  const category = data.get('category');
  const rating = Number(data.get('rating'));
  const message = typeof data.get('message') === 'string' ? (data.get('message') as string) : '';
  const name = typeof data.get('name') === 'string' ? (data.get('name') as string).trim() : '';
  const organization =
    typeof data.get('organization') === 'string' ? (data.get('organization') as string).trim() : '';
  if (
    email.length === 0 ||
    typeof role !== 'string' ||
    typeof experience !== 'string' ||
    typeof category !== 'string' ||
    !Number.isInteger(rating)
  )
    return undefined;
  return {
    email,
    ...(name.length === 0 ? {} : { name }),
    ...(organization.length === 0 ? {} : { organization }),
    role: role as LandingFeedbackRole,
    experience: experience as LandingFeedbackExperience,
    category: category as LandingFeedbackCategory,
    rating,
    message,
    contactPermission: data.get('contactPermission') !== null,
  };
}

export function LandingPage({
  locale,
  routeHash = '',
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly routeHash?: string;
}) {
  const markup = useMemo(
    () =>
      prepareTeammateLandingMarkup(teammateLandingHtml, {
        locale,
        billingHref: `/${locale}/billing`,
        signInHref: `/${locale}/sign-in`,
        signInLabel: locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in',
        downloadsHref: `/${locale}/downloads`,
        downloadsLabel: locale === 'vi-VN' ? 'Ứng dụng' : 'Apps',
      }),
    [locale],
  );
  const feedbackApi = useMemo(() => createLandingFeedbackApi(), []);
  // Keep the innerHTML prop stable while only the route hash changes. The
  // landing script progressively adds reveal state and interaction layers to
  // this DOM; replacing it on every navbar jump would discard that state.
  const markupProperty = useMemo(() => ({ __html: markup }), [markup]);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return undefined;

    document.documentElement.classList.add('js');
    const script = document.createElement('script');
    script.src = TEAMMATE_LANDING_SCRIPT;
    document.body.appendChild(script);
    return () => {
      document.documentElement.classList.remove('js');
      script.remove();
    };
  }, []);

  useEffect(() => {
    if (routeHash.length <= 1) return;

    let destinationId: string;
    try {
      destinationId = decodeURIComponent(routeHash.slice(1));
    } catch {
      return;
    }

    const scrollToDestination = () => {
      const destination = document.getElementById(destinationId);
      if (destination === null) return;

      const revealItems = destination.matches('[data-reveal]')
        ? [destination]
        : Array.from(destination.querySelectorAll<HTMLElement>('[data-reveal]'));
      revealItems.forEach((item) => item.classList.add('is-visible'));
      if (typeof destination.scrollIntoView === 'function') {
        destination.scrollIntoView({ block: 'start' });
      }
    };
    const stylesheet = document.querySelector<HTMLLinkElement>(
      'link[data-teammate-landing-stylesheet]',
    );
    scrollToDestination();
    const frame = window.requestAnimationFrame(scrollToDestination);
    stylesheet?.addEventListener('load', scrollToDestination, { once: true });

    return () => {
      window.cancelAnimationFrame(frame);
      stylesheet?.removeEventListener('load', scrollToDestination);
    };
  }, [routeHash, markup]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.teammate-landing-root');
    if (root === null) return;
    const pricingSection = root.querySelector<HTMLElement>('[data-pricing-section]');
    if (pricingSection === null) return;

    const pricingLocale = pricingSection.dataset['pricingLocale'] === 'en' ? 'en-US' : 'vi-VN';
    const formatPricingAmount = (value: number) =>
      `${new Intl.NumberFormat(pricingLocale).format(value)} ₫`;

    const handlePricingCycleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('[data-pricing-cycle]');
      if (button === null || !root.contains(button)) return;

      const cycle = button.dataset['pricingCycle'];
      if (cycle !== 'monthly' && cycle !== 'annual') return;

      root.querySelectorAll<HTMLButtonElement>('[data-pricing-cycle]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      root
        .querySelector<HTMLElement>('[data-pricing-cycle-control]')
        ?.style.setProperty('--pricing-cycle-index', cycle === 'annual' ? '1' : '0');
      root.querySelectorAll<HTMLElement>('[data-pricing-amount]').forEach((amount) => {
        const value = Number(amount.dataset[cycle]);
        if (Number.isFinite(value)) amount.textContent = formatPricingAmount(value);
      });
      root.querySelectorAll<HTMLElement>('[data-pricing-suffix]').forEach((suffix) => {
        suffix.textContent = suffix.dataset[`${cycle}Suffix`] ?? '';
      });
      root.querySelectorAll<HTMLElement>('[data-pricing-detail]').forEach((detail) => {
        detail.textContent = detail.dataset[`${cycle}Detail`] ?? '';
      });
      root.querySelectorAll<HTMLAnchorElement>('[data-pricing-cta]').forEach((cta) => {
        const href = cta.dataset[`${cycle}Href`];
        if (href !== undefined) cta.setAttribute('href', href);
      });
      const status = root.querySelector<HTMLElement>('[data-pricing-status]');
      if (status !== null) {
        status.textContent =
          pricingLocale === 'en-US'
            ? `Showing ${cycle === 'annual' ? 'annual' : 'monthly'} prices.`
            : `Đang hiển thị giá theo ${cycle === 'annual' ? 'năm' : 'tháng'}.`;
      }
    };

    root.addEventListener('click', handlePricingCycleClick);
    return () => root.removeEventListener('click', handlePricingCycleClick);
  }, [locale, markup]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.teammate-landing-root');
    if (root === null) return undefined;

    // WEB-026: the public feedback form submits only through the closed v4 command
    // contract; a server acceptance is required before any success is announced.
    const handleSubmit = async (event: SubmitEvent) => {
      event.preventDefault();
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches('[data-feedback-form]')) return;
      const copy = FEEDBACK_COPY[locale];
      const status = form.querySelector<HTMLElement>('[data-feedback-status]');
      const statusMark = form.querySelector<HTMLElement>('.form-status-mark');
      const submitButton = form.querySelector<HTMLButtonElement>('[data-feedback-submit]');

      if (!form.checkValidity()) {
        status?.classList.remove('success');
        status?.classList.add('error');
        if (status !== null) status.textContent = copy.invalid;
        return;
      }
      const submission = readFeedbackSubmission(form);
      if (submission === undefined) {
        status?.classList.remove('success');
        status?.classList.add('error');
        if (status !== null) status.textContent = copy.invalid;
        return;
      }

      if (submitButton !== null) submitButton.disabled = true;
      status?.classList.remove('error', 'success');
      if (status !== null) status.textContent = copy.sending;
      const result = await feedbackApi.submit(submission);
      if (submitButton !== null) submitButton.disabled = false;
      if (result.accepted) {
        form.classList.remove('was-validated');
        form.reset();
        form
          .querySelectorAll('[data-character-count]')
          .forEach((counter) => (counter.textContent = '0'));
        status?.classList.add('success');
        if (status !== null) status.textContent = copy.sent;
        if (statusMark !== null) statusMark.innerHTML = `<i></i>${copy.sentMark}`;
        return;
      }
      status?.classList.add('error');
      if (status !== null)
        status.textContent =
          result.code === 'LANDING_FEEDBACK_RATE_LIMITED'
            ? copy.rateLimited
            : result.code === 'LANDING_FEEDBACK_COMMAND_INVALID'
              ? copy.invalid
              : copy.failed;
    };
    const handleSubmitEvent = (event: SubmitEvent) => {
      void handleSubmit(event);
    };

    root.addEventListener('submit', handleSubmitEvent);
    return () => root.removeEventListener('submit', handleSubmitEvent);
  }, [locale, markup, feedbackApi]);

  return (
    <>
      <link data-teammate-landing-stylesheet href={TEAMMATE_LANDING_STYLESHEET} rel="stylesheet" />
      <div className="teammate-landing-root" dangerouslySetInnerHTML={markupProperty} />
    </>
  );
}

export function LandingRoutePage() {
  const { locale: routeLocale } = useParams();
  const { hash } = useLocation();
  return <LandingPage locale={normalizeRouteLocale(routeLocale)} routeHash={hash} />;
}
