import { Page } from '@/components/PageLayout';
import { SearchAddress } from '@/components/SearchAddress';
import { SelectedWallet } from '@/components/UserInfo';
import { HealthScore } from '@/components/Analyze/HealthScore';
import { TopBar } from '@worldcoin/mini-apps-ui-kit-react';

export default function AnalyzePage() {

  return (
    <>
      <Page.Header className="p-0">
        <TopBar title="Analyze" />
        <div className="px-6 pt-3 pb-3">
          <SearchAddress />
        </div>
        <div className="px-6 pb-3">
          <SelectedWallet />
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pb-24 md:pb-28">
        <HealthScore />
      </Page.Main>
    </>
  );
}


