import {
  ACCESS_PRESET_MAPPINGS_V1,
  accessPresetForRoleIdV1,
  isMembershipAccessPresetV1,
  MEMBERSHIP_ACCESS_PRESETS_V1,
  type AccessPresetMappingV1,
  type InitialRoleIdV1,
  type MembershipAccessPresetV1,
} from '@databreeze/domain/permissions/v1';

export { MEMBERSHIP_ACCESS_PRESETS_V1 };
export type { MembershipAccessPresetV1 };

export const IAM_ACCESS_PRESET_SERVICE = Symbol('IAM_ACCESS_PRESET_SERVICE');

export type AccessPresetApplicationCodeV1 = 'INVALID_PRESET' | 'INVALID_ROLE';

export type AccessPresetApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AccessPresetApplicationCodeV1 };

/** IAM-025: versioned Owner/Editor/Viewer presentation mapping over canonical roles. */
export class AccessPresetService {
  public resolvePresetPermissions(
    preset: unknown,
  ): AccessPresetApplicationResultV1<AccessPresetMappingV1> {
    if (!isMembershipAccessPresetV1(preset)) {
      return Object.freeze({ accepted: false, code: 'INVALID_PRESET' });
    }
    return Object.freeze({ accepted: true, value: ACCESS_PRESET_MAPPINGS_V1[preset] });
  }

  public presetForRoleId(roleId: unknown): MembershipAccessPresetV1 | undefined {
    return accessPresetForRoleIdV1(roleId);
  }

  public roleIdForPreset(preset: MembershipAccessPresetV1): InitialRoleIdV1 {
    return ACCESS_PRESET_MAPPINGS_V1[preset].roleId;
  }
}
