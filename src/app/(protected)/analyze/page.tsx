import { auth } from '@/auth';
import { Page } from '@/components/PageLayout';
import { TopBar } from '@worldcoin/mini-apps-ui-kit-react';

export default async function AnalyzePage() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0">
        <TopBar title="Analyze" />
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pb-24 md:pb-28">
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <h2 className="text-base font-semibold mb-1">Overview</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {session?.user.username ? `Hi ${session.user.username},` : 'Hi,'} here you can explore insights about your portfolio, risk, and opportunities.
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <h3 className="text-sm font-semibold mb-2">Suggested next steps</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            <li>Consider staking idle stablecoins to earn yield</li>
            <li>Diversify exposure across chains to reduce gas and risk</li>
            <li>Set alerts for large balance changes</li>
          </ul>
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <h3 className="text-sm font-semibold mb-2">Learning</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            We will surface educational explainers here: what staking is, how LPs work, and where to find trusted protocols.
          </p>
        </section>
      </Page.Main>
    </>
  );
}


