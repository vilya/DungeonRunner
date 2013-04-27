DROPBOX_DIR = /cygdrive/C/Users/vilya/Dropbox
DEPLOY_DIR = $(DROPBOX_DIR)/Public/DungeonRunner
SRC_DIR = .


.PHONY: deploy
deploy: deploy_dir fix_perms
	cp -R $(SRC_DIR)/* $(DEPLOY_DIR)


.PHONY: deploy_dir
deploy_dir:
	mkdir -p $(DEPLOY_DIR)


.PHONY: fix_perms
fix_perms:
	chmod a-x Makefile index.html README.md js/* 


clean:
	@echo rm -rf $(DEPLOY_DIR)

