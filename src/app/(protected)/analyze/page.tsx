import { Page } from '@/components/PageLayout';
import { HealthScore } from '@/components/Analyze/HealthScore';
import { TopBar } from '@worldcoin/mini-apps-ui-kit-react';

export default function AnalyzePage() {

  return (
    <>
      <Page.Header className="p-0">
        <TopBar title="Analyze" />
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pb-24 md:pb-28">
        <HealthScore />
      </Page.Main>
    </>
  );
}


