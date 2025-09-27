import { auth } from '@/auth';
import { Navigation } from '@/components/Navigation';
import { Page } from '@/components/PageLayout';
import { PortfolioDataProvider } from '@/contexts/PortfolioDataContext';

export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // If the user is not authenticated, redirect to the login page
  if (!session) {
    console.log('Not authenticated');
    // redirect('/');
  }

  return (
    <PortfolioDataProvider>
      <Page>
        <div
          className="pb-32"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 120px)' }}
        >
          {children}
        </div>
        <Page.Footer className="px-0 fixed bottom-0 w-full bg-white/95 backdrop-blur-sm border-t border-gray-200 z-50 shadow-lg">
          <Navigation />
        </Page.Footer>
      </Page>
    </PortfolioDataProvider>
  );
}
