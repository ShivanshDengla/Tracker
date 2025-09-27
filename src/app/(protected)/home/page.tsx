import { Page } from '@/components/PageLayout';
import { SearchAddress } from '@/components/SearchAddress';
import { TokenList } from '@/components/TokenList';
import { SelectedWallet } from '@/components/UserInfo';
import { TopBar } from '@worldcoin/mini-apps-ui-kit-react';

export default function Home() {
  return (
    <>
      <Page.Header className="p-0">
        <TopBar />
        <div className="px-6 pt-3 pb-3">
          <SearchAddress />
        </div>
        <div className="px-6 pb-3">
          <SelectedWallet />
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col items-center justify-start gap-6 pb-24 md:pb-28">
        <TokenList />
      </Page.Main>
    </>
  );
}
