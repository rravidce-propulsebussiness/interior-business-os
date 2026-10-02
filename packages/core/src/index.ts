/** Server-resolved grants; never construct these from untrusted request payloads. */
export interface PermissionGrant {
  readonly permission: string;
  readonly scope:
    | { readonly kind: 'organization' }
    | { readonly kind: 'branch'; readonly branchId: string };
}
export interface TenantAccessContext {
  readonly userId: string;
  readonly organizationId: string;
  readonly membershipStatus: 'active' | 'suspended';
  readonly grants: readonly PermissionGrant[];
  readonly entitlements: readonly string[];
}
