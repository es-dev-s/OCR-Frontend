"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Shield, UserPlus } from "lucide-react";
import {
  ApiError,
  createUser,
  listUsers,
  patchUser,
  resetUserPassword,
  type AuthUser,
} from "@/lib/api";
import { selectAuthUser, selectIsAdmin, useAuthStore } from "@/store/auth-store";
import { Modal } from "@/components/ui/Modal";

export default function UsersPage() {
  const router = useRouter();
  const isAdmin = useAuthStore(selectIsAdmin);
  const me = useAuthStore(selectAuthUser);
  const ready = useAuthStore((s) => s.ready);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<AuthUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers();
      setUsers(res.users ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!isAdmin) {
      router.replace("/documents");
      return;
    }
    void load();
  }, [ready, isAdmin, router, load]);

  if (!ready || !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="page-x flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] py-3">
        <div>
          <p className="text-[13px] text-[var(--muted)]">
            Admin-only user management
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--ink)] px-3 text-[13px] font-semibold text-white transition hover:opacity-90"
        >
          <Plus className="size-4" strokeWidth={1.75} />
          Add user
        </button>
      </div>

      {error ? (
        <div className="page-x mt-3">
          <div className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      <div className="page-x min-h-0 flex-1 overflow-auto py-4">
        <div className="workspace-band">
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
            <Loader2 className="size-4 animate-spin" />
            Loading users…
          </div>
        ) : (
          <div className="w-full overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="w-full table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead className="bg-[var(--surface-muted)] text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-[var(--border)] bg-[var(--surface)]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--ink)]">{u.name}</p>
                      <p className="text-[12px] text-[var(--muted)]">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11.5px] font-medium">
                        {u.role === "admin" ? (
                          <Shield className="size-3" strokeWidth={1.75} />
                        ) : null}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                          u.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700",
                        ].join(" ")}
                      >
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <RoleSelect
                          user={u}
                          disabled={u.id === me?.id}
                          onChanged={load}
                        />
                        <button
                          type="button"
                          disabled={u.id === me?.id && u.is_active}
                          onClick={async () => {
                            try {
                              await patchUser(u.id, { is_active: !u.is_active });
                              await load();
                            } catch (err) {
                              setError(
                                err instanceof ApiError
                                  ? err.message
                                  : "Update failed",
                              );
                            }
                          }}
                          className="rounded-lg px-2 py-1 text-[12px] font-medium text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-40"
                        >
                          {u.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetFor(u)}
                          className="rounded-lg px-2 py-1 text-[12px] font-medium text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                        >
                          Reset password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await load();
        }}
      />
      <ResetPasswordModal
        user={resetFor}
        onClose={() => setResetFor(null)}
        onDone={async () => {
          setResetFor(null);
        }}
      />
    </div>
  );
}

function RoleSelect({
  user,
  disabled,
  onChanged,
}: {
  user: AuthUser;
  disabled?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <select
      disabled={disabled || busy}
      value={user.role}
      onChange={async (e) => {
        const role = e.target.value as "admin" | "member";
        if (role === user.role) return;
        setBusy(true);
        try {
          await patchUser(user.id, { role });
          await onChanged();
        } catch {
          // parent list will refresh; ignore
        } finally {
          setBusy(false);
        }
      }}
      className="h-8 rounded-lg border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--ink)] outline-none disabled:opacity-40"
    >
      <option value="member">member</option>
      <option value="admin">admin</option>
    </select>
  );
}

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createUser({ name, email, password, role });
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add user"
      description="Only admins can create accounts."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-[14px] text-[var(--ink)] outline-none"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-[14px] text-[var(--ink)] outline-none"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-[14px] text-[var(--ink)] outline-none"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-[14px] text-[var(--ink)] outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-3 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--ink)] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" strokeWidth={1.75} />
            )}
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AuthUser | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setPassword("");
      setError(null);
      setBusy(false);
    }
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await resetUserPassword(user.id, password);
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Reset password"
      description={user ? `Set a new password for ${user.email}` : undefined}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="New password">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-[14px] outline-none"
          />
        </Field>
        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-3 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-10 rounded-xl bg-[var(--ink)] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
