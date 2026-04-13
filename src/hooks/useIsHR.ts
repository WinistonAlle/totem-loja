import { useEffect, useState } from "react";
import { APP_EVENT, subscribeAppEvent } from "@/lib/appEvents";
import { getEmployeeSession } from "@/utils/employeeSession";

export function useIsHR() {
  const [canHR, setCanHR] = useState(() => getEmployeeSession()?.role === "rh");

  useEffect(() => {
    const sync = () => setCanHR(getEmployeeSession()?.role === "rh");
    const onStorage = (event: StorageEvent) => {
      if (event.key === "employee_session") sync();
    };

    const unsubscribe = subscribeAppEvent(APP_EVENT.employeeSessionChanged, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { data: canHR, isLoading: false };
}
