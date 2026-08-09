'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Button } from './button';
import { Alert, ErrorAlert } from './alert';
import { Field } from './field';
import { Input, Select, Textarea } from './input';
import { getAccessRequestOptions, submitAccessRequest } from '@/api/auth.api';
import type { AccessRequestOptions, AccessRequestPayload } from '@/api/auth.api';
import { useSubmit } from '@/hooks/useSubmit';
import { ORG } from '@/lib/site';
import { PATHS } from '@/routes/paths';

/*
 * Request a staff account.
 *
 * This is NOT a sign-up. POST /auth/access-requests records a request that an
 * administrator reviews; approval is what creates the account and emails an invitation
 * link, and the password is set there. Hence no password field, and copy that says
 * "request" throughout — a form that promises an account and delivers a pending review
 * is a form people fill in twice.
 *
 * Field names and limits mirror `submitAccessRequestSchema` in
 * Backend/src/modules/auth/auth.schema.js.
 */

const EMPTY: AccessRequestPayload = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  requestedRole: '',
  departmentId: '',
  motivation: '',
};

export interface RequestAccessFormProps {
  onSignIn: () => void;
  /** Where someone seeking help from NWHR, rather than a staff login, should go. */
  getHelpHref: string;
  firstNameRef?: React.Ref<HTMLInputElement>;
}

export function RequestAccessForm({
  onSignIn,
  getHelpHref,
  firstNameRef,
}: RequestAccessFormProps) {
  const [form, setForm] = useState<AccessRequestPayload>(EMPTY);
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null);

  const [options, setOptions] = useState<AccessRequestOptions | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);

  const { submit, busy, error, fieldErrors, clearFieldError } = useSubmit(submitAccessRequest, {
    onSuccess: (result) => {
      setForm(EMPTY);
      setAcknowledgement(result.message);
    },
  });

  /*
   * Roles and departments are server-owned. Hard-coding them here would offer a
   * department that no longer exists, and the request would fail validation on submit
   * with an error the applicant cannot act on.
   */
  useEffect(() => {
    const controller = new AbortController();
    getAccessRequestOptions(controller.signal)
      .then(setOptions)
      .catch(() => {
        if (!controller.signal.aborted) setOptionsFailed(true);
      });
    return () => controller.abort();
  }, []);

  const update = useCallback(
    <K extends keyof AccessRequestPayload>(key: K, value: AccessRequestPayload[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      // Clear the server's complaint as soon as the field is edited — leaving it under
      // an input the person just fixed reads as the fix not having worked.
      clearFieldError(key);
    },
    [clearFieldError]
  );

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(form);
  }

  /*
   * `options` is null both while loading and after a failure, so the empty option has
   * to tell them apart — otherwise a failed load leaves a select reading "Loading…"
   * for as long as the page stays open.
   */
  // Kept short: a select is narrow, and a long string truncates mid-word. The banner
  // above carries the full explanation.
  const placeholderFor = (noun: string) =>
    optionsFailed ? 'Unavailable' : options ? `Select a ${noun}…` : 'Loading…';

  const formClasses = 'flex min-h-full flex-col justify-center gap-4 px-6 py-10 lg:px-8';

  if (acknowledgement) {
    return (
      <div className={formClasses}>
        <h1 className="text-3xl font-semibold tracking-tight">Request received</h1>
        {/*
          * The server returns this same sentence whether a request was written, the
          * address already belongs to staff, or one is already pending. Render it as
          * given — rewording it per outcome would turn the form into an oracle for who
          * works here.
          */}
        <Alert tone="success">{acknowledgement}</Alert>
        <p className="text-xs text-subtle">
          An administrator reviews each request. If it is approved you will be emailed a link
          to set your password and activate the account. The link is valid for seven days.
        </p>

        {/*
          * Shown unconditionally, which is what makes it safe.
          *
          * The server answers this form identically whether a request was written, the
          * address already belongs to staff, or one is already pending — so it cannot
          * tell someone who already has an account that they do. Left there, that person
          * waits for an invitation that will never arrive, because nothing was written.
          *
          * Naming both routes for everyone gives them the way out without the response
          * ever varying by outcome.
          */}
        <div className="rounded-md border border-line bg-sunken p-3 text-xs text-muted">
          <p className="font-medium text-body">Already have an account?</p>
          <p className="mt-1">
            You will not receive a second invitation.{' '}
            <button
              type="button"
              onClick={onSignIn}
              className="text-brand-500 underline underline-offset-2"
            >
              Sign in
            </button>{' '}
            instead, or{' '}
            <a href={PATHS.forgotPassword} className="text-brand-500 underline underline-offset-2">
              reset your password
            </a>
            . If you were invited but never set a password and the link has expired, ask the
            person who invited you to send a new one.
          </p>
        </div>

        <Button onClick={onSignIn} className="max-lg:w-full lg:self-start">
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form className={formClasses} onSubmit={handleSubmit}>
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-subtle uppercase">
          Account request
        </p>
        <h1 className="mt-2 text-3xl leading-[1.1] font-semibold tracking-[-0.02em]">
          Request staff access
        </h1>
        <p className="mt-2 max-w-[34ch] text-sm text-muted">
          For {ORG.shortName} staff and volunteers. An administrator reviews every request.
        </p>
      </div>

      {/*
        * Someone looking for help from NWHR must not end up in the staff queue. Without
        * this they wait weeks for a rejection instead of getting assistance — the most
        * costly wrong turn available on this page.
        */}
      <Alert tone="info">
        Looking for help from {ORG.shortName}? You do not need an account —{' '}
        <a className="underline underline-offset-2" href={getHelpHref}>
          find support here
        </a>
        .
      </Alert>

      {error && <ErrorAlert error={error} />}

      {optionsFailed && (
        <Alert tone="error">Could not load the role and department lists. Please reload the page.</Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" error={fieldErrors.firstName}>
          {(field) => (
            <Input
              {...field}
              ref={firstNameRef}
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              autoComplete="given-name"
              maxLength={80}
              required
              disabled={busy}
            />
          )}
        </Field>

        <Field label="Last name" error={fieldErrors.lastName}>
          {(field) => (
            <Input
              {...field}
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              autoComplete="family-name"
              maxLength={80}
              required
              disabled={busy}
            />
          )}
        </Field>

        <Field label="Work email" error={fieldErrors.email} className="sm:col-span-2">
          {(field) => (
            <Input
              {...field}
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              autoComplete="email"
              required
              disabled={busy}
            />
          )}
        </Field>

        <Field
          label="Phone number"
          error={fieldErrors.phone}
          hint="South African or international. Stored in +27 format."
          className="sm:col-span-2"
        >
          {(field) => (
            <Input
              {...field}
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              autoComplete="tel"
              placeholder="072 123 4567"
              maxLength={20}
              required
              disabled={busy}
            />
          )}
        </Field>

        <Field label="Role you are applying for" error={fieldErrors.requestedRole}>
          {(field) => (
            <Select
              {...field}
              placeholder={placeholderFor('role')}
              value={form.requestedRole}
              onChange={(e) => update('requestedRole', e.target.value)}
              required
              disabled={busy || !options}
            >
              {options?.roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Department" error={fieldErrors.departmentId}>
          {(field) => (
            <Select
              {...field}
              placeholder={placeholderFor('department')}
              value={form.departmentId}
              onChange={(e) => update('departmentId', e.target.value)}
              required
              disabled={busy || !options}
            >
              {options?.departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Why do you need access?"
          optional
          error={fieldErrors.motivation}
          // The reviewer reads this in an email. Nobody should paste a beneficiary's
          // details into a field that leaves the system.
          hint={`Describe your role at ${ORG.shortName}. Do not include any beneficiary's details.`}
          className="sm:col-span-2"
        >
          {(field) => (
            <Textarea
              {...field}
              value={form.motivation}
              onChange={(e) => update('motivation', e.target.value)}
              maxLength={1000}
              disabled={busy}
            />
          )}
        </Field>
      </div>

      <Button
        type="submit"
        loading={busy}
        disabled={!options}
        className="max-lg:w-full lg:self-start"
      >
        {busy ? 'Sending…' : 'Submit request'}
      </Button>

      <button
        type="button"
        className="self-start text-sm text-muted underline underline-offset-2 hover:text-brand-500"
        onClick={onSignIn}
      >
        Already have an account? Sign in
      </button>
    </form>
  );
}
