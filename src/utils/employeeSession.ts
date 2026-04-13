export type EmployeeSession = {
  id: string;
  full_name: string;
  cpf: string;
  role: string;
  employee_cpf?: string;
};

function readJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getEmployeeSession(): EmployeeSession | null {
  if (typeof window === "undefined") return null;

  const parsed = readJson(localStorage.getItem("employee_session"));
  if (!parsed || typeof parsed !== "object") return null;

  const candidate = parsed as Partial<EmployeeSession>;
  if (!candidate.cpf || !candidate.role) return null;

  return {
    id: String(candidate.id ?? ""),
    full_name: String(candidate.full_name ?? ""),
    cpf: String(candidate.cpf),
    role: String(candidate.role),
    employee_cpf: candidate.employee_cpf ? String(candidate.employee_cpf) : undefined,
  };
}

export function getEmployeeCpfFromStorage(): string {
  if (typeof window === "undefined") return "";

  const fallback =
    localStorage.getItem("gm_employee_cpf") ||
    localStorage.getItem("employee_cpf") ||
    localStorage.getItem("cpf");

  if (fallback) return String(fallback).replace(/\D/g, "");

  const session = getEmployeeSession();
  return String(session?.cpf ?? session?.employee_cpf ?? "").replace(/\D/g, "");
}
