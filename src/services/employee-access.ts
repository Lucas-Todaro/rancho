"use client";

export async function syncEmployeePanelAccess(employeeId: string | undefined, accessToken?: string, options: { forceDisabled?: boolean } = {}) {
  if (!employeeId || !accessToken) return;

  const response = await fetch("/api/employees/sync-access", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ employeeId, forceDisabled: options.forceDisabled === true })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível sincronizar o acesso ao sistema deste funcionário.");
  }
}
