import { auth } from '@/auth';
import { Page } from '@/components/PageLayout';
import { SearchAddress } from '@/components/SearchAddress';
import { TokenList } from '@/components/TokenList';
import { Marble, TopBar } from '@worldcoin/mini-apps-ui-kit-react';

export default async function Home() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          endAdornment={
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold capitalize">
                {session?.user.username}
              </p>
              <Marble src={session?.user.profilePictureUrl} className="w-12" />
            </div>
          }
        />
      </Page.Header>
      <Page.Main className="flex flex-col items-center justify-start gap-6 pb-24 md:pb-28">
        <SearchAddress />
        <TokenList />
      </Page.Main>
    </>
  );
}
