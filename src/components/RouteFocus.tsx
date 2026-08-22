import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function RouteFocus() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.querySelector<HTMLElement>("[data-route-heading]")?.focus();
  }, [pathname]);

  return null;
}
