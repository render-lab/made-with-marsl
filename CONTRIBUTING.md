# Review a project release

Review the source, build recipe, README, HOWTO, license, attribution, and sample data together. Check that instructions describe observed behavior and name required configuration without including credentials. Preserve the original project's license; publication does not grant rights the author does not have.

Package submissions only add files beneath their own version directory. Changes to workflows or collection scripts require a separate maintainer review. Do not use `pull_request_target` to run project code.

Merging a release starts its image build. A failed build needs investigation; rerun the workflow for a transient failure, or publish a new version when the source or recipe needs correction. Never edit an already published release or move its tag to another image.
