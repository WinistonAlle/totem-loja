// src/hooks/useEmployee.ts
import { useEffect, useState } from "react";
import { APP_EVENT, subscribeAppEvent } from "@/lib/appEvents";
import { getEmployeeSession, type EmployeeSession } from "@/utils/employeeSession";

export function useEmployee() {
  const [employee, setEmployee] = useState<EmployeeSession | null>(() => getEmployeeSession());

  useEffect(() => {
    const sync = () => {
      try {
        setEmployee(getEmployeeSession());
      } catch (err) {
        console.error("Erro ao ler sessão do funcionário:", err);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "employee_session") sync();
    };

    const unsubscribe = subscribeAppEvent(APP_EVENT.employeeSessionChanged, sync);
    window.addEventListener("storage", onStorage);
    sync();

    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { employee };
}
