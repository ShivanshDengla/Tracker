import { Page } from '@/components/PageLayout';
import { SearchAddress } from '@/components/SearchAddress';
import { SelectedWallet } from '@/components/UserInfo';
import { HealthScore } from '@/components/Analyze/HealthScore';

export default function AnalyzePage() {

  return (
    <div className="min-h-screen bg-red-50/30">
      <Page.Header className="p-0">
        <div className="px-6 pt-3 pb-2">
          <SelectedWallet />
        </div>
        <div className="px-6 pb-3">
          <SearchAddress />
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pb-24 md:pb-28">
        <HealthScore />
      </Page.Main>
    </div>
  );
}


