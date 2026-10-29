import { getBots } from '@/app/actions/bots';

export type AdminBotListItem = Awaited<ReturnType<typeof getBots>>['bots'][number];
