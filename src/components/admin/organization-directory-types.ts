import { getOrganizations } from '@/app/actions/organizations';

export type AdminOrganizationListItem = Awaited<ReturnType<typeof getOrganizations>>['organizations'][number];
