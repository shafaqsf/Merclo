import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { HOW_IT_WORKS, SETUP_STEPS } from "@/lib/docs";

export const metadata = {
  title: "How it works · Merclo",
};

export default function DocsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          How Merclo works
        </h1>
        <p className="text-sm text-foreground">
          Merclo puts an AI shopping assistant inside your storefront. This
          page explains what it does for your shoppers, and how to get one
          running.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          What it does
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map((card, i) => (
            <Card key={card.title}>
              <CardBody className="space-y-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-[15px] font-semibold text-foreground">
                  {i + 1}
                </span>
                <h3 className="text-[15px] font-semibold text-ink">
                  {card.title}
                </h3>
                <p className="text-[13px] leading-relaxed text-foreground">
                  {card.description}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          Steps to a running bot
        </h2>
        <ol className="space-y-3">
          {SETUP_STEPS.map((step, i) => (
            <li key={step.title}>
              <Card>
                <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-[15px] font-semibold text-ink">
                        {step.title}
                      </h3>
                      <p className="text-[13px] leading-relaxed text-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  <ButtonLink
                    href={step.href}
                    variant="secondary"
                    size="sm"
                    className="shrink-0 self-start sm:self-center"
                  >
                    {step.cta}
                  </ButtonLink>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-ink">
              Prefer a guided setup?
            </h3>
            <p className="text-[13px] leading-relaxed text-foreground">
              The onboarding wizard walks you through creating your first bot,
              installing the widget, and trying it out — all in one flow.
            </p>
          </div>
          <ButtonLink
            href="/dashboard/onboarding"
            className="shrink-0 self-start sm:self-center"
          >
            Start onboarding
          </ButtonLink>
        </CardBody>
      </Card>
    </div>
  );
}
