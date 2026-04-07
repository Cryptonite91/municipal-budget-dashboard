import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useMunicipality } from "@/hooks/use-budget-data";
import { BookOpen, Mail, Phone, Globe, HelpCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const glossary = [
  {
    term: "General Fund",
    definition: "The main operating fund for the municipality. It covers day-to-day expenses like salaries, utilities, and supplies that don't have a dedicated funding source.",
  },
  {
    term: "Enterprise Fund",
    definition: "A self-supporting fund for services that charge fees to users, like water, sewer, or a community pool. Revenue from fees covers the costs of providing the service.",
  },
  {
    term: "Capital Budget",
    definition: "Money set aside for large, long-term investments like building a new school, replacing a bridge, or purchasing major equipment. These are separate from day-to-day operating costs.",
  },
  {
    term: "Budget Year",
    definition: "The 12-month period the town uses for budgeting and financial reporting. Most Vermont municipalities run July 1 through June 30. '2026' refers to the fiscal year ending in 2026 (July 2025 through June 2026).",
  },
  {
    term: "Property Tax (Mill Rate)",
    definition: "A tax on real estate used to fund local services. The mill rate is the tax per $1,000 of assessed property value. For example, a rate of 20 mills means $20 in tax for every $1,000 of value.",
  },
  {
    term: "State Aid",
    definition: "Funding the municipality receives from the State of Vermont, often tied to specific programs like education, highway maintenance, or community development.",
  },
  {
    term: "ARPA Funds",
    definition: "American Rescue Plan Act funds — one-time federal money given to municipalities to help recover from the economic impacts of COVID-19. These funds have specific rules about how they can be spent.",
  },
  {
    term: "Budget Reserve (Rainy Day Fund)",
    definition: "Money the town sets aside for unexpected expenses or emergencies. Financial experts recommend reserves of 8-17% of the annual budget. Think of it as the town's savings account.",
  },
  {
    term: "Year-over-Year (YoY)",
    definition: "A comparison between this year's numbers and last year's. If the Public Safety budget went from $10M to $10.5M, that's a 5% YoY increase.",
  },
  {
    term: "Revenue Efficiency",
    definition: "How much of the budgeted (expected) revenue was actually collected. If the town expected $40M and collected $38M, revenue efficiency is 95%. Higher is better.",
  },
  {
    term: "Cost per Resident",
    definition: "The total budget divided by population. This gives a simple way to understand the per-person cost of running the town. It doesn't mean each person pays that amount — it varies by property value and other factors.",
  },
  {
    term: "Bond / Debt Service",
    definition: "When the town borrows money (issues bonds) for large projects, 'debt service' is the annual payments of principal and interest on that debt. Similar to monthly mortgage payments on a home.",
  },
];

const howToRead = [
  {
    title: "Understanding the Dashboard Overview",
    content: "The Overview page gives you the big picture. The KPI cards at the top show the most important numbers: total budget, how much has been spent, and the cost per resident. The donut chart shows how each dollar is divided across departments.",
  },
  {
    title: "Reading the Revenue Sources",
    content: "Revenue is where the town's money comes from. Property taxes are typically the largest source. The bar chart compares what was budgeted (expected) versus what was actually collected. Clicking a category shows the individual sources within it.",
  },
  {
    title: "Understanding Department Spending",
    content: "The Spending page shows how budget is allocated across departments like Education, Public Safety, and Public Works. Click any department to see the specific categories within it. The 'percent spent' badge shows how much of each department's budget has been used so far.",
  },
  {
    title: "Using the Year Comparison Tool",
    content: "The Compare Years page lets you see how budgets changed from one year to the next. Increases are shown in red (costs went up) and decreases in green (costs went down). This helps you understand spending trends over time.",
  },
  {
    title: "Tracking Capital Projects",
    content: "Capital projects are major infrastructure investments. The progress bar shows how far along each project is. The color indicates status: green means on track, yellow means at risk of delays, and red means behind schedule.",
  },
];

export default function Help() {
  const { data: muni } = useMunicipality();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px] mx-auto">
      <div>
        <h1 className="text-xl font-bold">Help & Glossary</h1>
        <p className="text-sm text-muted-foreground">
          Learn how to read this dashboard and understand budget terminology
        </p>
      </div>

      {/* How to Read */}
      <Card data-testid="card-how-to-read">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            How to Read This Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {howToRead.map((item, i) => (
              <AccordionItem key={i} value={`how-${i}`}>
                <AccordionTrigger className="text-sm font-medium">{item.title}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Budget Glossary */}
      <Card data-testid="card-glossary">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Budget Glossary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {glossary.map((item, i) => (
              <AccordionItem key={i} value={`term-${i}`}>
                <AccordionTrigger className="text-sm font-medium">{item.term}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.definition}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Share */}
      <Card data-testid="card-share">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share This Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Help your neighbors understand the budget. Share this dashboard to promote transparency and civic engagement.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" data-testid="btn-share-copy">
              Copy Link
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      {muni && (
        <Card data-testid="card-contact">
          <CardHeader>
            <CardTitle className="text-base">Questions?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Have questions about the {muni.name} budget? Reach out to the Finance Department.
            </p>
            <div className="space-y-2 text-sm">
              {muni.contactEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${muni.contactEmail}`} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                    {muni.contactEmail}
                  </a>
                </div>
              )}
              {muni.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{muni.contactPhone}</span>
                </div>
              )}
              {muni.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a href={muni.website} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                    {muni.website}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
