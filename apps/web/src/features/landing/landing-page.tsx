import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import teammateLandingHtml from '../../../../../prototypes/databreeze-landing/index.html?raw';
import { prepareTeammateLandingMarkup } from './landing-markup.ts';
import './landing-host.css';

export function LandingPage({ locale }: { readonly locale: 'en' | 'vi-VN' }) {
  const markup = useMemo(
    () =>
      prepareTeammateLandingMarkup(teammateLandingHtml, {
        signInHref: `/${locale}/sign-in`,
        signInLabel: locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in',
      }),
    [locale],
  );

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return undefined;

    document.documentElement.classList.add('js');
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/landing/styles.css';
    document.head.appendChild(stylesheet);
    const script = document.createElement('script');
    script.src = '/landing/script.js';
    document.body.appendChild(script);
    return () => {
      stylesheet.remove();
      script.remove();
    };
  }, []);

  return <div className="teammate-landing-root" dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function LandingRoutePage() {
  const { locale: routeLocale } = useParams();
  return <LandingPage locale={normalizeRouteLocale(routeLocale)} />;
}
