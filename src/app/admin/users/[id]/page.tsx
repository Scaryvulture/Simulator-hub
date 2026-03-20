import { getUser } from '@/app/actions/users';
import { getAllOrganizations } from '@/app/actions/organizations';
import { UserEditor } from '@/components/admin/user-editor';
import { notFound } from 'next/navigation';

interface Props {
    params: Promise<{ id: string }>;
}

export default async function UserEditPage({ params }: Props) {
    const { id } = await params;
    const user = await getUser(id);
    const organizations = await getAllOrganizations();

    if (!user) {
        notFound();
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <UserEditor
                user={user}
                availableOrganizations={organizations}
            />
        </div>
    );
}
