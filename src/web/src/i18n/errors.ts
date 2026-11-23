import { ApiError } from '../lib/api/client';

// The API sends codes, never sentences (AD-023). This maps each code to its translation.
// When the backend adds a code in Quart.SharedKernel.ErrorCodes, add it here and in both locale files.
const errorKeys = {
  'common.not_found': 'errors.common.not_found',
  'common.validation': 'errors.common.validation',
  'common.unauthorized': 'errors.common.unauthorized',
  'common.forbidden': 'errors.common.forbidden',
  'common.conflict': 'errors.common.conflict',
  'common.too_many_requests': 'errors.common.too_many_requests',
  'common.unexpected': 'errors.common.unexpected',
  'common.network': 'errors.common.network',
  'auth.antiforgery': 'errors.auth.antiforgery',
  'auth.current_password_wrong': 'errors.auth.current_password_wrong',
  'auth.delete_email_mismatch': 'errors.auth.delete_email_mismatch',
  'auth.email_invalid': 'errors.auth.email_invalid',
  'auth.email_not_verified': 'errors.auth.email_not_verified',
  'auth.email_same': 'errors.auth.email_same',
  'auth.invalid_credentials': 'errors.auth.invalid_credentials',
  'auth.language_invalid': 'errors.auth.language_invalid',
  'auth.link_expired': 'errors.auth.link_expired',
  'auth.link_invalid': 'errors.auth.link_invalid',
  'auth.link_used': 'errors.auth.link_used',
  'auth.locked_out': 'errors.auth.locked_out',
  'auth.name_invalid': 'errors.auth.name_invalid',
  'auth.owns_workplace': 'errors.auth.owns_workplace',
  'auth.password_breached': 'errors.auth.password_breached',
  'auth.password_too_short': 'errors.auth.password_too_short',
  'availability.hours_invalid': 'errors.availability.hours_invalid',
  'availability.hours_required': 'errors.availability.hours_required',
  'availability.locked': 'errors.availability.locked',
  'availability.not_shift_worker': 'errors.availability.not_shift_worker',
  'availability.note_empty': 'errors.availability.note_empty',
  'availability.note_too_long': 'errors.availability.note_too_long',
  'availability.shift_note_too_long': 'errors.availability.shift_note_too_long',
  'availability.shift_note_unselected': 'errors.availability.shift_note_unselected',
  'availability.too_many_notes': 'errors.availability.too_many_notes',
  'availability.unknown_shift': 'errors.availability.unknown_shift',
  'marketplace.already_offered': 'errors.marketplace.already_offered',
  'marketplace.already_requested': 'errors.marketplace.already_requested',
  'marketplace.item_invalid': 'errors.marketplace.item_invalid',
  'marketplace.missing_level': 'errors.marketplace.missing_level',
  'marketplace.no_longer_pending': 'errors.marketplace.no_longer_pending',
  'marketplace.not_shift_worker': 'errors.marketplace.not_shift_worker',
  'marketplace.not_your_shift': 'errors.marketplace.not_your_shift',
  'marketplace.nothing_to_claim': 'errors.marketplace.nothing_to_claim',
  'marketplace.overlap': 'errors.marketplace.overlap',
  'marketplace.own_shift': 'errors.marketplace.own_shift',
  'marketplace.shift_started': 'errors.marketplace.shift_started',
  'marketplace.shift_taken': 'errors.marketplace.shift_taken',
  'marketplace.trade_invalid': 'errors.marketplace.trade_invalid',
  'push.endpoint_invalid': 'errors.push.endpoint_invalid',
  'push.keys_invalid': 'errors.push.keys_invalid',
  'push.off': 'errors.push.off',
  'period.already_started': 'errors.period.already_started',
  'period.due_after_start': 'errors.period.due_after_start',
  'period.due_in_past': 'errors.period.due_in_past',
  'period.due_required': 'errors.period.due_required',
  'period.overlaps': 'errors.period.overlaps',
  'period.start_not_monday': 'errors.period.start_not_monday',
  'period.template_empty': 'errors.period.template_empty',
  'period.unfinished_exists': 'errors.period.unfinished_exists',
  'schedule.note_too_long': 'errors.schedule.note_too_long',
  'schedule.already_on_shift': 'errors.schedule.already_on_shift',
  'schedule.cannot_clear_published': 'errors.schedule.cannot_clear_published',
  'schedule.double_booking': 'errors.schedule.double_booking',
  'schedule.not_building': 'errors.schedule.not_building',
  'schedule.not_on_shift': 'errors.schedule.not_on_shift',
  'schedule.not_published': 'errors.schedule.not_published',
  'schedule.nothing_to_publish': 'errors.schedule.nothing_to_publish',
  'schedule.publish_blocked': 'errors.schedule.publish_blocked',
  'schedule.publish_needs_confirmation': 'errors.schedule.publish_needs_confirmation',
  'schedule.unknown_member': 'errors.schedule.unknown_member',
  'schedule.unknown_shift': 'errors.schedule.unknown_shift',
  'schedule.visit_ended': 'errors.schedule.visit_ended',
  'settings.max_consecutive_invalid': 'errors.settings.max_consecutive_invalid',
  'settings.period_weeks_invalid': 'errors.settings.period_weeks_invalid',
  'template.conflict_duplicate': 'errors.template.conflict_duplicate',
  'template.conflict_invalid': 'errors.template.conflict_invalid',
  'template.crosses_midnight': 'errors.template.crosses_midnight',
  'template.headcount_invalid': 'errors.template.headcount_invalid',
  'template.no_days': 'errors.template.no_days',
  'template.off_grid': 'errors.template.off_grid',
  'template.requirement_exceeds_headcount': 'errors.template.requirement_exceeds_headcount',
  'template.requirement_invalid': 'errors.template.requirement_invalid',
  'template.time_invalid': 'errors.template.time_invalid',
  'template.too_many_blocks': 'errors.template.too_many_blocks',
  'workplace.already_member': 'errors.workplace.already_member',
  'workplace.has_upcoming_shifts': 'errors.workplace.has_upcoming_shifts',
  'workplace.hours_invalid': 'errors.workplace.hours_invalid',
  'workplace.invitation_invalid': 'errors.workplace.invitation_invalid',
  'workplace.join_code_unknown': 'errors.workplace.join_code_unknown',
  'workplace.level_invalid': 'errors.workplace.level_invalid',
  'workplace.name_required': 'errors.workplace.name_required',
  'workplace.owner_cannot_leave': 'errors.workplace.owner_cannot_leave',
  'workplace.time_zone_unknown': 'errors.workplace.time_zone_unknown',
} as const;

type ErrorKey = (typeof errorKeys)[keyof typeof errorKeys];

export function errorKeyFor(error: unknown): ErrorKey {
  // Anything that is not an API error is a bug in the web app itself: "something went wrong".
  const code = error instanceof ApiError ? error.code : 'common.unexpected';
  return (errorKeys as Record<string, ErrorKey>)[code] ?? errorKeys['common.unexpected'];
}

/**
 * The one sentence to show for a failed request. A validation problem names what is wrong in its first
 * error ("the start date must be a Monday"), which says more than "check what you entered".
 */
export function messageKeyFor(error: unknown): ErrorKey {
  const first = error instanceof ApiError ? error.errors[0] : undefined;
  if (error instanceof ApiError && first) {
    return errorKeyFor(new ApiError(error.status, first.code));
  }
  return errorKeyFor(error);
}

/** The server trace ID behind an error, when there is one (a lost connection has none). */
export function traceIdOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.traceId : undefined;
}
