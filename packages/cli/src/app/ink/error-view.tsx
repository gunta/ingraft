import { Box, Text } from "ink"

import type { ErrorPresentation } from "../../domain/errors.ts"
import { palette } from "../theme.ts"
import { Notice, Section } from "./components.tsx"

export const ErrorView = ({ presentation }: { readonly presentation: ErrorPresentation }) => (
  <Box flexDirection="column">
    <Notice kind="error" title={presentation.title} />
    {presentation.detail ? (
      <Section title="Details">
        <Text color={palette.text}>{presentation.detail}</Text>
      </Section>
    ) : null}
    {presentation.hint ? (
      <Section title="Hint">
        <Text color={palette.text}>{presentation.hint}</Text>
      </Section>
    ) : null}
  </Box>
)
