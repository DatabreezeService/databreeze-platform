import { useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import teammateLandingHtml from '../../../../../prototypes/databreeze-landing/index.html?raw';
import { prepareTeammateLandingMarkup } from './landing-markup.ts';
import './landing-host.css';

const TEAMMATE_LANDING_STYLESHEET = '/landing/styles.css';
const TEAMMATE_LANDING_SCRIPT = '/landing/script.js';

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
        registerHref: `/${locale}/register`,
        signInHref: `/${locale}/sign-in`,
        signInLabel: locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in',
        downloadsHref: `/${locale}/downloads`,
        downloadsLabel: locale === 'vi-VN' ? 'Ứng dụng' : 'Apps',
      }),
    [locale],
  );

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

  return (
    <>
      <link data-teammate-landing-stylesheet href={TEAMMATE_LANDING_STYLESHEET} rel="stylesheet" />
      <div className="teammate-landing-root" dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}

export function LandingRoutePage() {
  const { locale: routeLocale } = useParams();
  const { hash } = useLocation();
  return <LandingPage locale={normalizeRouteLocale(routeLocale)} routeHash={hash} />;
}
