import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { SERVICE_MAP, isOAuthService } from '../config/services';

function parseOAuthPayload(location) {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(location.search);

  const error = hash.get('error') || search.get('error');
  const errorDescription =
    hash.get('error_description') ||
    search.get('error_description') ||
    hash.get('message') ||
    search.get('message');

  const accessToken = hash.get('access_token') || search.get('access_token') || search.get('token');
  const tokenType = hash.get('token_type') || search.get('token_type') || 'Bearer';
  const expiresIn = Number(hash.get('expires_in') || search.get('expires_in') || 0) || undefined;

  return { error, errorDescription, accessToken, tokenType, expiresIn };
}

export default function ServiceCallback() {
  const { service } = useParams();
  const navigate = useNavigate();
  const { finishOAuthConnect, failConnect } = useApp();

  useEffect(() => {
    if (!service || !SERVICE_MAP[service] || !isOAuthService(service)) {
      navigate('/', { replace: true });
      return;
    }

    const payload = parseOAuthPayload(window.location);

    if (payload.error) {
      failConnect(service, payload.errorDescription || payload.error);
      navigate(`/auth/${service}?error=${encodeURIComponent(payload.errorDescription || payload.error)}`, { replace: true });
      return;
    }

    if (!payload.accessToken) {
      failConnect(service, 'No access token was returned by the provider.');
      navigate(`/auth/${service}?error=${encodeURIComponent('No access token was returned by the provider.')}`, { replace: true });
      return;
    }

    finishOAuthConnect(service, {
      accessToken: payload.accessToken,
      tokenType: payload.tokenType,
      expiresIn: payload.expiresIn,
      isMock: false,
    });
    navigate('/visualizer', { replace: true });
  }, [failConnect, finishOAuthConnect, navigate, service]);

  return (
    <div className="min-h-screen cp-app flex items-center justify-center px-6">
      <div className="glass-card cy-card rounded-2xl p-6 w-full max-w-xl text-center">
        <p className="mono-meta mb-2">AUTH CALLBACK</p>
        <h1 className="section-title">FINALIZING LOGIN</h1>
        <p className="hero-copy mt-3">
          Processing provider response and restoring your Lemon session...
        </p>
      </div>
    </div>
  );
}

