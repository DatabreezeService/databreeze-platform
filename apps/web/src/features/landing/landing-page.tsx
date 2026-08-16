import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import teammateLandingHtml from '../../../../../prototypes/databreeze-landing/index.html?raw';
import { prepareTeammateLandingMarkup } from './landing-markup.ts';
import './landing-host.css';

const TEAMMATE_LANDING_STYLESHEET = '/landing/styles.css';
const TEAMMATE_LANDING_SCRIPT = '/landing/script.js';

export function LandingPage({ locale }: { readonly locale: 'en' | 'vi-VN' }) {
  const markup = useMemo(
    () =>
      prepareTeammateLandingMarkup(teammateLandingHtml, {
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

  return (
    <>
      <link href={TEAMMATE_LANDING_STYLESHEET} rel="stylesheet" />
      <div className="teammate-landing-root" dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}

export function LandingRoutePage() {
  const { locale: routeLocale } = useParams();
  return <LandingPage locale={normalizeRouteLocale(routeLocale)} />;
}
