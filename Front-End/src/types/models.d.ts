/*
 * The entities the application shell itself touches: the signed-in user, the
 * department they belong to, and their notifications.
 *
 * Feature models (Beneficiary, Case, Transaction, …) belong with their feature's
 * `api/*.api.ts` module. Declaring them here ahead of the screens that use them
 * produces a file that drifts from the server the moment anyone changes a schema.
 */

import type {
  AccessRequestStatus,
  NotificationPriority,
  NotificationType,
  Role,
  UserStatus,
} from './enums';

/** Mongo ObjectId as it arrives over the wire. */
export type Id = string;

/** ISO 8601, always UTC from the server. Render through lib/dates.ts. */
export type IsoDate = string;

export interface Timestamps {
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * A reference field that the server may or may not have populated. `GET /auth/me`
 * populates `departmentId`; most other paths leave it as a bare id.
 */
export type Ref<T> = Id | T;

export interface Department extends Timestamps {
  _id: Id;
  name: string;
  slug: string;
}

/**
 * Staff account. `passwordHash` and `mfaSecret` are stripped by the model's toJSON
 * transform and can never appear here.
 *
 * Note `role` — not a permission list. The server sends the role and the client
 * derives permissions from its mirror of the matrix (src/auth/permissions.ts) purely
 * to decide what to *render*. Every actual decision is made server-side.
 */
export interface User extends Timestamps {
  _id: Id;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  departmentId: Ref<Department> | null;
  status: UserStatus;
  /** Assigned programmes. Populated only for PROJECT_COORDINATOR; empty for everyone else. */
  programmes: Id[];
  mfaEnabled: boolean;
  lastLoginAt: IsoDate | null;
  invitedBy: Id | null;
}

export interface Notification extends Timestamps {
  _id: Id;
  userId: Id;
  /**
   * A pointer, never a disclosure — the server writes "A new beneficiary was
   * registered", not the person's name. Safe to render in a bell menu.
   */
  title: string;
  message: string;
  type: NotificationType;
  /**
   * The record this is about. `type` says which collection it points into, so a click
   * can be routed without a second lookup. Null for SYSTEM notifications.
   */
  referenceId: Id | null;
  priority: NotificationPriority;
  isRead: boolean;
  readAt: IsoDate | null;
}

/** A request from someone who wants a staff account. Terminal once reviewed. */
export interface AccessRequest extends Timestamps {
  _id: Id;
  name: string;
  email: string;
  phone: string | null;
  requestedRole: Role;
  motivation: string;
  status: AccessRequestStatus;
  reviewedBy: Ref<User> | null;
  reviewedAt: IsoDate | null;
  reviewNote: string | null;
}
