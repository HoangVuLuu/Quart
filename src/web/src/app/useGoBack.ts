import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Back arrows return to the page the person came from (6, 2026-11-18). With nothing to go back to inside
 * the app (opened from a push notification or a link, or the first page of the tab), they go to the page's
 * normal parent. React Router names the first page of a tab "default".
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key !== 'default') {
      void navigate(-1);
    } else {
      void navigate(fallback, { replace: true });
    }
  }, [navigate, key, fallback]);
}
