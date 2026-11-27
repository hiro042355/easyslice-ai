import { test } from "node:test";
import assert from "node:assert/strict";

import { Breadcrumb } from "../../components/ui/Breadcrumb";
import { HamburgerMenu } from "../../components/ui/HamburgerMenu";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { RadioGroup } from "../../components/ui/RadioGroup";
import { SelectionCard } from "../../components/ui/SelectionCard";
import { Accordion, AccordionItem } from "../../components/ui/Accordion";

test("UI Components - imports and exports exist and are functions", () => {
  assert.equal(typeof Breadcrumb, "function");
  assert.equal(typeof HamburgerMenu, "function");
  assert.equal(typeof Modal, "function");
  assert.equal(typeof Select, "function");
  assert.equal(typeof RadioGroup, "function");
  assert.equal(typeof SelectionCard, "function");
  assert.equal(typeof Accordion, "function");
  assert.equal(typeof AccordionItem, "function");
});
