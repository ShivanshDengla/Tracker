import { Page } from '@/components/PageLayout';
import { SearchAddress } from '@/components/SearchAddress';
import { TokenList } from '@/components/TokenList';
import { SelectedWallet } from '@/components/UserInfo';

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0fdf4' }}>
      <Page.Header className="p-0">
        <div className="px-6 pt-3 pb-2">
          <SelectedWallet />
        </div>
        <div className="px-6 pb-3">
          <SearchAddress />
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col items-center justify-start gap-6 pb-24 md:pb-28">
        <TokenList />
      </Page.Main>
    </div>
  );
}
