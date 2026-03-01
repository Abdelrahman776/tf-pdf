import BeforeAfterSection from "../components/BeforeAfter.tsx";
import Features from "../components/Features.tsx";
import Hero from "../components/Hero.tsx";
import Pricing from "../components/Pricing.tsx";

export function HomePage() {
  return (
    <>
      <Hero />
      <BeforeAfterSection />
      <Features />
      <Pricing />
    </>
  );
}
