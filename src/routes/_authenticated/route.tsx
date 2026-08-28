import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (
        profile?.must_change_password &&
        location.pathname !== "/change-password"
      ) {
        navigate({ to: "/change-password", replace: true });
      }
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  if (!checked) return null;
  return <Outlet />;
}
